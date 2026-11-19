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
import { PLATFORM_CURRENCY } from '../common/constants/currency.constants';
import { PoliciesService } from '../policies/policies.service';
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
import { RefundsService } from './refunds.service';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { STRIPE_CLIENT } from './stripe.provider';

/** Sent to after-confirmation handlers once PAY-01 has confirmed a paid booking. */
export interface BookingConfirmedEvent {
  bookingType: BookingType;
  bookingId: string;
  paymentId: string;
  paidAt: Date;
}

/**
 * Runs after PAY-01 has confirmed the booking (e.g. HTL-17 / FLT-23: booking reference,
 * seat conversion, notification). The confirmation itself always stays in PAY-01.
 */
export type BookingConfirmedHandler = (event: BookingConfirmedEvent) => Promise<void>;

/** FLT-27: set on the PaymentIntent of a fare difference, so the webhook can tell it from a booking payment. */
export const FARE_PAYMENT_PURPOSE = 'flight-change';

/** Sent to FLT-27 once the fare difference of a flight change has been paid. */
export interface FarePaidEvent {
  changeId: string;
  paymentIntentId: string;
  /** Amount Stripe received, in major units. */
  amountReceived: number;
  currency: string;
  paidAt: Date;
}
export type FarePaidHandler = (event: FarePaidEvent) => Promise<void>;

/** The booking fields PAY-01 needs, shared by flight and hotel bookings. */
interface PayableBooking {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  status: string;
  totalPrice: number;
  /** Flight bookings only: baggage is kept apart from the seat fares (FLT-21 total = fares + baggage). */
  baggageFees?: number;
  holdExpiresAt?: Date;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Amount charged for a booking. Same calculation as the FLT-21 booking summary
 * (pricing.total = seat fares + FLT-19 baggage fees, each rounded to cents), so the
 * user is charged exactly the total shown before payment. Hotel bookings have no
 * baggage fees, so their amount is the HTL-16 reservation total.
 */
export function bookingAmount(totalPrice: number, baggageFees = 0): number {
  return round2(round2(totalPrice) + round2(baggageFees));
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly confirmedHandlers: BookingConfirmedHandler[] = [];
  private readonly farePaidHandlers: FarePaidHandler[] = [];

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(FlightBooking.name) private flightBookingModel: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private hotelBookingModel: Model<HotelBookingDocument>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly config: ConfigService,
    private readonly policies: PoliciesService,
    private readonly refundsService: RefundsService,
  ) {}

  /**
   * Registers a handler that runs after PAY-01 has confirmed a paid booking, e.g. HTL-17:
   *   payments.onBookingConfirmed(async ({ bookingType, bookingId }) => {
   *     if (bookingType === BookingType.HOTEL) await confirmation.afterConfirmed(bookingId);
   *   });
   * Handlers are called only when PAY-01's atomic confirmation succeeded (still Pending Payment,
   * paid within the hold, provider active). A failing handler is logged and never undoes it.
   */
  onBookingConfirmed(handler: BookingConfirmedHandler): void {
    this.confirmedHandlers.push(handler);
  }

  /**
   * FLT-27: registers the handler that applies a flight change once its fare difference is paid.
   * Called from the webhook for PaymentIntents created by createFarePayment(); a failing handler is logged.
   */
  onFarePaid(handler: FarePaidHandler): void {
    this.farePaidHandlers.push(handler);
  }

  /**
   * FLT-27: PaymentIntent for the extra fare of a flight change. It is separate from the booking's
   * own payment (a booking has exactly one Payment, which stays as it was paid).
   */
  async createFarePayment(input: {
    amount: number;
    changeId: string;
    bookingId: string;
  }): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const stripe = this.requireStripe();
    const intent = await stripe.paymentIntents.create({
      amount: this.toMinorUnits(input.amount),
      currency: PLATFORM_CURRENCY.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        purpose: FARE_PAYMENT_PURPOSE,
        changeId: input.changeId,
        bookingType: BookingType.FLIGHT,
        bookingId: input.bookingId,
      },
    });
    return { paymentIntentId: intent.id, clientSecret: intent.client_secret! };
  }

  /**
   * FLT-27: cancels an unpaid fare PaymentIntent. Returns false when the money is already moving
   * (succeeded / processing): the webhook decides then.
   */
  async cancelFarePayment(paymentIntentId: string): Promise<boolean> {
    if (!this.stripe) return true;
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === 'succeeded' || intent.status === 'processing') return false;
    if (intent.status !== 'canceled') {
      await this.stripe.paymentIntents.cancel(intent.id);
    }
    return true;
  }

  /** FLT-27: gives a paid fare difference back when the change could not be applied. */
  async refundFarePayment(paymentIntentId: string, amount: number, changeId: string): Promise<void> {
    const stripe = this.requireStripe();
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: this.toMinorUnits(amount),
      metadata: { purpose: FARE_PAYMENT_PURPOSE, changeId },
    });
  }

  /**
   * PAY-01: create a Stripe PaymentIntent for the caller's Pending Payment booking.
   * A booking has exactly one payment record, whose ID is the booking ID, so two
   * requests at the same time can never create two payments (no double charge).
   */
  async create(userId: string, dto: CreatePaymentDto): Promise<PaymentSessionResponseDto> {
    const stripe = this.requireStripe();
    const booking = await this.findPayableBooking(dto.bookingType, dto.bookingId, userId);
    const payment = await this.findOrCreatePayment(userId, dto.bookingType, booking);

    if (payment.status === PaymentStatus.SUCCEEDED) {
      throw new ConflictException('This booking is already paid');
    }
    if (payment.status === PaymentStatus.FAILED) {
      throw new ConflictException('The last payment failed; use the retry endpoint');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException('The booking hold has expired');
    }

    if (payment.stripePaymentIntentId) {
      // Same booking asked again while pending: hand back the same PaymentIntent.
      const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      if (intent.status !== 'canceled' && intent.client_secret) {
        return this.toSession(payment, intent.client_secret);
      }
    }
    const clientSecret = await this.attachNewIntent(stripe, payment);
    return this.toSession(payment, clientSecret);
  }

  /** PAY-01: retry a failed payment while the booking hold is still active. */
  async retry(userId: string, paymentId: string): Promise<PaymentSessionResponseDto> {
    const stripe = this.requireStripe();
    const payment = await this.findOwnPayment(userId, paymentId);
    if (payment.status !== PaymentStatus.FAILED) {
      throw new ConflictException('Only a failed payment can be retried');
    }
    await this.findPayableBooking(payment.bookingType, payment.bookingId.toString(), userId);

    // Claim the retry atomically so two retries at once cannot both reopen it.
    const claimed = await this.paymentModel.updateOne(
      { _id: payment._id, status: PaymentStatus.FAILED },
      { $set: { status: PaymentStatus.PENDING } },
    );
    if (claimed.modifiedCount !== 1) {
      throw new ConflictException('This payment is already being retried');
    }
    payment.status = PaymentStatus.PENDING;

    try {
      // After a failure Stripe keeps the same PaymentIntent open for a new card.
      if (payment.stripePaymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
        if (intent.status === 'requires_payment_method' && intent.client_secret) {
          return this.toSession(payment, intent.client_secret);
        }
      }
      return this.toSession(payment, await this.attachNewIntent(stripe, payment));
    } catch (error) {
      await this.paymentModel.updateOne(
        { _id: payment._id, status: PaymentStatus.PENDING },
        { $set: { status: PaymentStatus.FAILED } },
      );
      throw error;
    }
  }

  /**
   * PAY-01: payment status for its owner. The payment ID equals the booking ID.
   * For a failed payment, the error is read from Stripe (it is not stored).
   */
  async findOne(userId: string, paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.findOwnPayment(userId, paymentId);
    const response = this.toResponse(payment);
    // PAY-03: the booking's refund status (Pending, Refunded, Failed) is shown with its payment.
    response.refund = (await this.refundsService.findByBooking(payment.bookingType, payment.bookingId)) ?? undefined;
    if (payment.status === PaymentStatus.FAILED && payment.stripePaymentIntentId && this.stripe) {
      try {
        const intent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
        response.failureReason = intent.last_payment_error?.message ?? 'Payment failed';
      } catch {
        response.failureReason = 'Payment failed';
      }
    }
    return response;
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
        if (event.data.object.metadata?.purpose === FARE_PAYMENT_PURPOSE) {
          await this.onFareSucceeded(event.data.object, new Date(event.created * 1000));
          break;
        }
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
    // The money has been taken, so the payment is recorded as succeeded either way.
    // One atomic update: if Stripe delivers the same event twice at the same moment, only one call
    // wins, so a booking is never both confirmed and refunded. A re-sent event after the payment was
    // already handled (succeeded, refunded, ...) matches nothing, so it can't reset the status.
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        stripePaymentIntentId: intent.id,
        status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.EXPIRED] },
      },
      { $set: { status: PaymentStatus.SUCCEEDED, paidAt } },
      { returnDocument: 'after' },
    );
    if (!payment) return; // unknown, or already handled

    const amountMatches =
      intent.amount_received === this.toMinorUnits(payment.amount) &&
      intent.currency.toUpperCase() === payment.currency;
    // Confirm only a booking that is still Pending Payment and was paid within its hold.
    const notConfirmedReason = amountMatches ? await this.confirmBooking(payment, paidAt) : 'amount mismatch';
    if (notConfirmedReason) {
      if (!amountMatches) {
        this.logger.warn(`Payment ${payment.id} succeeded but the booking was not confirmed (amount mismatch)`);
      }
      // PAY-03 / project description 6.4: money taken without a confirmed booking is refunded in full.
      await this.refundsService.refundUnconfirmedPayment(
        payment,
        intent.amount_received / 100,
        `Booking not confirmed: ${notConfirmedReason}`,
      );
    }
  }

  private async onFareSucceeded(intent: Stripe.PaymentIntent, paidAt: Date): Promise<void> {
    const changeId = intent.metadata?.changeId;
    if (!changeId) return;
    const event: FarePaidEvent = {
      changeId,
      paymentIntentId: intent.id,
      amountReceived: intent.amount_received / 100,
      currency: intent.currency.toUpperCase(),
      paidAt,
    };
    for (const handler of this.farePaidHandlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`Fare payment handler failed for change ${changeId}: ${(error as Error).message}`);
      }
    }
  }

  private async onFailed(intent: Stripe.PaymentIntent): Promise<void> {
    await this.paymentModel.updateOne(
      { stripePaymentIntentId: intent.id, status: PaymentStatus.PENDING },
      { $set: { status: PaymentStatus.FAILED } },
    );
  }

  /** One payment per booking: its _id is the booking _id, so MongoDB rejects a duplicate. */
  private async findOrCreatePayment(
    userId: string,
    bookingType: BookingType,
    booking: PayableBooking,
  ): Promise<PaymentDocument> {
    const existing = await this.paymentModel.findById(booking._id);
    if (existing) return existing;
    try {
      return await this.paymentModel.create({
        _id: booking._id,
        userId: new Types.ObjectId(userId),
        bookingType,
        bookingId: booking._id,
        bookingModel: this.bookingModelName(bookingType),
        // FLT-21: charge exactly the summary total; hotel bookings have no baggage.
        amount: bookingAmount(booking.totalPrice, booking.baggageFees),
        currency: PLATFORM_CURRENCY,
        status: PaymentStatus.PENDING,
        expiresAt: booking.holdExpiresAt,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        // Another request created it at the same moment; use that one.
        const created = await this.paymentModel.findById(booking._id);
        if (created) return created;
      }
      throw error;
    }
  }

  /**
   * Create a PaymentIntent and attach it only if nobody else attached one first;
   * otherwise cancel ours, so a booking never has two open PaymentIntents.
   */
  private async attachNewIntent(stripe: Stripe, payment: PaymentDocument): Promise<string> {
    const previousId = payment.stripePaymentIntentId ?? null;
    const intent = await this.createIntent(stripe, payment);
    const attached = await this.paymentModel.updateOne(
      { _id: payment._id, stripePaymentIntentId: previousId },
      { $set: { stripePaymentIntentId: intent.id } },
    );
    if (attached.modifiedCount !== 1) {
      await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
      throw new ConflictException('A payment for this booking is already being started; try again');
    }
    payment.stripePaymentIntentId = intent.id;
    return intent.client_secret!;
  }

  /**
   * Confirms the booking, then runs the after-confirmation handlers.
   * Not confirmed when the provider was deactivated (ACC-15) or the hold ended; the payment
   * stays recorded as succeeded and is refunded in full (PAY-03).
   * Returns null when confirmed, otherwise the reason it was not.
   */
  private async confirmBooking(payment: PaymentDocument, paidAt: Date): Promise<string | null> {
    if (!(await this.providerIsActive(payment))) {
      this.logger.warn(`Payment ${payment.id} succeeded but the booking was not confirmed (provider deactivated)`);
      return 'provider deactivated';
    }
    if (!(await this.confirmBookingStatus(payment, paidAt))) {
      this.logger.warn(`Payment ${payment.id} succeeded but the booking was not confirmed (hold ended)`);
      return 'hold ended';
    }

    const event: BookingConfirmedEvent = {
      bookingType: payment.bookingType,
      bookingId: payment.bookingId.toString(),
      paymentId: payment.id,
      paidAt,
    };
    for (const handler of this.confirmedHandlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`After-confirmation handler failed for payment ${payment.id}: ${(error as Error).message}`);
      }
    }
    return null;
  }

  /**
   * ACC-15: a booking is only confirmed while its hotel, or every airline on its flights,
   * is still active (isActive !== false). A missing provider counts as inactive.
   */
  private async providerIsActive(payment: PaymentDocument): Promise<boolean> {
    if (payment.bookingType === BookingType.FLIGHT) {
      const booking = await this.flightBookingModel
        .findById(payment.bookingId)
        .select('outboundFlight returnFlight')
        .populate([
          { path: 'outboundFlight', select: 'airline', populate: { path: 'airline', select: 'isActive' } },
          { path: 'returnFlight', select: 'airline', populate: { path: 'airline', select: 'isActive' } },
        ])
        .lean<{ outboundFlight?: { airline?: { isActive?: boolean } }; returnFlight?: { airline?: { isActive?: boolean } } }>();
      const legs = [booking?.outboundFlight, booking?.returnFlight].filter(Boolean);
      return legs.length > 0 && legs.every((leg) => !!leg!.airline && leg!.airline.isActive !== false);
    }
    const booking = await this.hotelBookingModel
      .findById(payment.bookingId)
      .select('hotel')
      .populate({ path: 'hotel', select: 'isActive' })
      .lean<{ hotel?: { isActive?: boolean } }>();
    return !!booking?.hotel && booking.hotel.isActive !== false;
  }

  /**
   * Built-in confirmation: one atomic update, so it can never race the FLT-22 /
   * HTL-18 expiry jobs (they also only change a booking that is still Pending Payment).
   */
  private async confirmBookingStatus(payment: PaymentDocument, paidAt: Date): Promise<boolean> {
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
    // PAY-02 / project description 6.4: payment is blocked until the provider policies are accepted.
    // Called before any PaymentIntent is created, for both a new payment and a retry.
    await this.policies.assertAccepted(type, bookingId);
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
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
    };
  }

  private toSession(payment: PaymentDocument, clientSecret: string): PaymentSessionResponseDto {
    return { ...this.toResponse(payment), clientSecret };
  }
}
