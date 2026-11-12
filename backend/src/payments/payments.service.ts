import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import {
  FlightBooking,
  FlightBookingStatus,
} from '../flight-bookings/schemas/flight-booking.schema';
import {
  HotelBooking,
  HotelBookingDocument,
  HotelBookingStatus,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto, PaymentSessionResponseDto } from './dto/payment-response.dto';
import { BookingType, PaymentStatus } from './enums/payment.enums';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { RefundsService } from './refunds.service';
import { STRIPE_CLIENT } from './stripe.provider';

/**
 * PAY-04: single platform currency. Fixed to USD (the Payment schema default)
 * until the PAY-04 work is merged and provides the configured value.
 */
export const PLATFORM_CURRENCY = 'USD';

/** Called after PAY-01 confirms a booking; FLT-23 / HTL-17 register these. */
export type BookingConfirmedHandler = (event: {
  bookingType: BookingType;
  bookingId: string;
  paymentId: string;
}) => Promise<void> | void;

/** The booking fields PAY-01 needs, shared by flight and hotel bookings. */
interface PayableBooking {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  status: string;
  totalPrice: number;
  holdExpiresAt?: Date;
  policiesAcceptedAt?: Date;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly confirmedHandlers: BookingConfirmedHandler[] = [];

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(FlightBooking.name) private flightBookingModel: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private hotelBookingModel: Model<HotelBookingDocument>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly config: ConfigService,
    private readonly refundsService: RefundsService,
  ) {}

  /**
   * Hook for FLT-23 / HTL-17: run extra confirmation steps (booking reference,
   * seat conversion, notification) after PAY-01 has set the booking to Confirmed.
   */
  onBookingConfirmed(handler: BookingConfirmedHandler): void {
    this.confirmedHandlers.push(handler);
  }

  /** PAY-01: create a Stripe PaymentIntent for the caller's Pending Payment booking. */
  async create(userId: string, dto: CreatePaymentDto): Promise<PaymentSessionResponseDto> {
    const stripe = this.requireStripe();
    const booking = await this.findPayableBooking(dto.bookingType, dto.bookingId, userId);

    const existing = await this.paymentModel.findOne({
      bookingType: dto.bookingType,
      bookingId: booking._id,
      status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.SUCCEEDED] },
    });
    if (existing?.status === PaymentStatus.SUCCEEDED) {
      throw new ConflictException('This booking is already paid');
    }
    if (existing?.status === PaymentStatus.FAILED) {
      throw new ConflictException('The last payment failed; use the retry endpoint');
    }
    if (existing?.stripePaymentIntentId) {
      // Same booking asked again while pending: hand back the same PaymentIntent.
      const intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      if (intent.status !== 'canceled' && intent.client_secret) {
        return this.toSession(existing, intent.client_secret);
      }
    }

    const payment =
      existing ??
      (await this.paymentModel.create({
        userId: new Types.ObjectId(userId),
        bookingType: dto.bookingType,
        bookingId: booking._id,
        bookingModel: this.bookingModelName(dto.bookingType),
        amount: booking.totalPrice,
        currency: PLATFORM_CURRENCY,
        status: PaymentStatus.PENDING,
        expiresAt: booking.holdExpiresAt,
      }));

    const intent = await this.createIntent(stripe, payment);
    payment.stripePaymentIntentId = intent.id;
    await payment.save();
    return this.toSession(payment, intent.client_secret!);
  }

  /** PAY-01: retry a failed payment while the booking hold is still active. */
  async retry(userId: string, paymentId: string): Promise<PaymentSessionResponseDto> {
    const stripe = this.requireStripe();
    const payment = await this.findOwnPayment(userId, paymentId);
    if (payment.status !== PaymentStatus.FAILED) {
      throw new ConflictException('Only a failed payment can be retried');
    }
    await this.findPayableBooking(payment.bookingType, payment.bookingId.toString(), userId);

    // After a failure Stripe keeps the same PaymentIntent open for a new card.
    let clientSecret: string | null = null;
    if (payment.stripePaymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      if (intent.status === 'requires_payment_method') {
        clientSecret = intent.client_secret;
      }
    }
    if (!clientSecret) {
      const intent = await this.createIntent(stripe, payment);
      payment.stripePaymentIntentId = intent.id;
      clientSecret = intent.client_secret!;
    }

    payment.status = PaymentStatus.PENDING;
    payment.retryCount += 1;
    payment.failureReason = undefined;
    await payment.save();
    return this.toSession(payment, clientSecret);
  }

  /** PAY-01: payment status for its owner. */
  async findOne(userId: string, paymentId: string): Promise<PaymentResponseDto> {
    return this.toResponse(await this.findOwnPayment(userId, paymentId));
  }

  /** PAY-01: verify a Stripe webhook and apply the payment outcome. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    const stripe = this.requireStripe();
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('Stripe webhook is not configured');
    }
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onSucceeded(event.data.object, new Date(event.created * 1000));
        break;
      case 'payment_intent.payment_failed':
        await this.onFailed(event.data.object);
        break;
      case 'payment_intent.canceled':
        await this.paymentModel.updateOne(
          {
            stripePaymentIntentId: event.data.object.id,
            status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
          },
          { $set: { status: PaymentStatus.EXPIRED } },
        );
        break;
      case 'refund.updated':
      case 'refund.failed':
        // PAY-03: Stripe reports the final refund result.
        await this.refundsService.handleStripeRefund(event.data.object);
        break;
      default:
        break; // other events are not used by PAY-01 / PAY-03
    }
  }

  /**
   * PAY-01: when the hold expires the PaymentIntent is cancelled.
   * Booking status (Expired, releasing inventory) is owned by FLT-22 / HTL-18.
   */
  async cancelExpiredPayments(now = new Date()): Promise<number> {
    if (!this.stripe) return 0;
    const expired = await this.paymentModel.find({
      status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      expiresAt: { $lte: now },
    });

    let count = 0;
    for (const payment of expired) {
      try {
        if (payment.stripePaymentIntentId) {
          const intent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
          if (intent.status === 'succeeded' || intent.status === 'processing') {
            continue; // money is moving; the webhook decides
          }
          if (intent.status !== 'canceled') {
            await this.stripe.paymentIntents.cancel(intent.id);
          }
        }
        const result = await this.paymentModel.updateOne(
          { _id: payment._id, status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
          { $set: { status: PaymentStatus.EXPIRED } },
        );
        count += result.modifiedCount;
      } catch (error) {
        this.logger.warn(`Could not cancel expired payment ${payment.id}: ${(error as Error).message}`);
      }
    }
    return count;
  }

  private async onSucceeded(intent: Stripe.PaymentIntent, paidAt: Date): Promise<void> {
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intent.id });
    if (!payment || payment.status === PaymentStatus.SUCCEEDED) return; // unknown or already handled

    if (intent.amount_received !== this.toMinorUnits(payment.amount) || intent.currency.toUpperCase() !== payment.currency) {
      this.logger.error(`PaymentIntent ${intent.id} amount/currency does not match payment ${payment.id}`);
      payment.failureReason = 'Paid amount does not match the booking total; booking not confirmed';
      await payment.save();
      return;
    }

    payment.status = PaymentStatus.SUCCEEDED;
    payment.paidAt = paidAt;

    // Confirm only a booking that is still Pending Payment and was paid within its hold.
    const confirmed = await this.confirmBooking(payment, paidAt);
    if (!confirmed) {
      // Not defined by the sheet; left unconfirmed pending TA clarification.
      payment.failureReason = 'Paid after the hold ended; booking not confirmed';
      this.logger.warn(`Payment ${payment.id} succeeded after the hold ended; booking not confirmed`);
    }
    await payment.save();

    if (confirmed) {
      for (const handler of this.confirmedHandlers) {
        try {
          await handler({
            bookingType: payment.bookingType,
            bookingId: payment.bookingId.toString(),
            paymentId: payment.id,
          });
        } catch (error) {
          this.logger.error(`Booking-confirmed handler failed: ${(error as Error).message}`);
        }
      }
    }
  }

  private async onFailed(intent: Stripe.PaymentIntent): Promise<void> {
    await this.paymentModel.updateOne(
      { stripePaymentIntentId: intent.id, status: PaymentStatus.PENDING },
      {
        $set: {
          status: PaymentStatus.FAILED,
          failureReason: intent.last_payment_error?.message ?? 'Payment failed',
        },
      },
    );
  }

  private async confirmBooking(payment: PaymentDocument, paidAt: Date): Promise<boolean> {
    if (payment.bookingType === BookingType.FLIGHT) {
      const res = await this.flightBookingModel.updateOne(
        {
          _id: payment.bookingId,
          status: FlightBookingStatus.PENDING_PAYMENT,
          holdExpiresAt: { $gte: paidAt },
        },
        { $set: { status: FlightBookingStatus.CONFIRMED, payment: payment._id } },
      );
      return res.modifiedCount === 1;
    }
    const res = await this.hotelBookingModel.updateOne(
      {
        _id: payment.bookingId,
        status: HotelBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { $gte: paidAt },
      },
      { $set: { status: HotelBookingStatus.CONFIRMED } },
    );
    return res.modifiedCount === 1;
  }

  private async findPayableBooking(type: BookingType, bookingId: string, userId: string): Promise<PayableBooking> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new NotFoundException('Booking not found');
    }
    const model: Model<any> = type === BookingType.FLIGHT ? this.flightBookingModel : this.hotelBookingModel;
    const booking = await model.findById(bookingId).lean<PayableBooking>();
    // Another user's booking is reported as not found so its existence is not leaked.
    if (!booking || booking.user.toString() !== userId) {
      throw new NotFoundException('Booking not found');
    }
    // Flight and hotel enums both use the value 'PENDING_PAYMENT'.
    if (booking.status !== FlightBookingStatus.PENDING_PAYMENT) {
      throw new ConflictException('Only a Pending Payment booking can be paid');
    }
    if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() <= Date.now()) {
      throw new ConflictException('The booking hold has expired');
    }
    if (!booking.policiesAcceptedAt) {
      throw new ConflictException('The provider policies must be accepted before payment (PAY-02)');
    }
    return booking;
  }

  private async findOwnPayment(userId: string, paymentId: string): Promise<PaymentDocument> {
    if (!Types.ObjectId.isValid(paymentId)) {
      throw new NotFoundException('Payment not found');
    }
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment || payment.userId.toString() !== userId) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  private createIntent(stripe: Stripe, payment: PaymentDocument): Promise<Stripe.PaymentIntent> {
    return stripe.paymentIntents.create({
      amount: this.toMinorUnits(payment.amount),
      currency: payment.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        paymentId: payment.id,
        bookingType: payment.bookingType,
        bookingId: payment.bookingId.toString(),
      },
    });
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  private bookingModelName(type: BookingType): string {
    return type === BookingType.FLIGHT ? FlightBooking.name : HotelBooking.name;
  }

  private toMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  private toResponse(payment: PaymentDocument): PaymentResponseDto {
    return {
      id: payment.id,
      bookingType: payment.bookingType,
      bookingId: payment.bookingId.toString(),
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      failureReason: payment.failureReason,
      retryCount: payment.retryCount,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
    };
  }

  private toSession(payment: PaymentDocument, clientSecret: string): PaymentSessionResponseDto {
    return { ...this.toResponse(payment), clientSecret };
  }
}
