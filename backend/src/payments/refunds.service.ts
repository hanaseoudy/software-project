import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundResponseDto } from './dto/refund-response.dto';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Refund, RefundDocument } from './schemas/refund.schema';
import { STRIPE_CLIENT } from './stripe.provider';

/**
 * PAY-03 input from the cancellation tasks (FLT-26, HTL-21, FLT-06...).
 * The caller computes the amount from the provider's tiers (FLT-09 / HTL-10),
 * because the user must see it before confirming. Provider-initiated
 * cancellations pass the full paid amount (100%).
 */
export interface IssueRefundInput {
  bookingType: BookingType;
  bookingId: string | Types.ObjectId;
  /** Refund amount in major units (e.g. dollars); must be > 0 and <= the amount paid. */
  amount: number;
  /** The tier/policy used to compute the amount, stored with the refund. */
  appliedPolicy?: Record<string, unknown>;
  reason?: string;
}

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectModel(Refund.name) private refundModel: Model<RefundDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(FlightBooking.name) private flightBookingModel: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private hotelBookingModel: Model<HotelBookingDocument>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * PAY-03: issue a Stripe refund for a cancelled booking with a positive refund amount.
   * Returns null when the amount is 0 (no refund is issued for a 0% tier).
   */
  async issueRefund(input: IssueRefundInput): Promise<RefundResponseDto | null> {
    const amount = Math.round(input.amount * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Refund amount must be zero or positive');
    }
    if (amount === 0) return null;

    const stripe = this.requireStripe();
    const bookingId = new Types.ObjectId(input.bookingId);
    await this.requireCancelledBooking(input.bookingType, bookingId);

    const payment = await this.paymentModel.findOne({
      bookingType: input.bookingType,
      bookingId,
      status: PaymentStatus.SUCCEEDED,
    });
    if (!payment?.stripePaymentIntentId) {
      throw new ConflictException('No successful payment found for this booking');
    }
    if (amount > payment.amount) {
      throw new BadRequestException('Refund amount cannot be more than the amount paid');
    }
    const existing = await this.refundModel.exists({
      paymentId: payment._id,
      status: { $in: [RefundStatus.PENDING, RefundStatus.REFUNDED] },
    });
    if (existing) {
      throw new ConflictException('This booking already has a refund');
    }

    const refund = await this.refundModel.create({
      paymentId: payment._id,
      userId: payment.userId,
      bookingType: input.bookingType,
      bookingId,
      amount,
      currency: payment.currency,
      status: RefundStatus.PENDING,
      reason: input.reason,
      appliedPolicy: input.appliedPolicy,
    });

    if (input.bookingType === BookingType.FLIGHT) {
      // Flight bookings have a refund reference in their schema; hotel refunds are found by booking.
      await this.flightBookingModel.updateOne({ _id: bookingId }, { $set: { refund: refund._id } });
    }

    try {
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: Math.round(amount * 100),
        metadata: { refundId: refund.id, bookingType: input.bookingType, bookingId: bookingId.toString() },
      });
      refund.stripeRefundId = stripeRefund.id;
      await refund.save();
      // Test mode often finishes at once; otherwise the webhook finishes it later.
      await this.applyStripeStatus(refund, stripeRefund);
    } catch (error) {
      this.logger.error(`Stripe refund failed for refund ${refund.id}: ${(error as Error).message}`);
      await this.finish(refund, RefundStatus.FAILED);
    }
    return this.toResponse(refund);
  }

  /** PAY-03: webhook entry for refund.updated / refund.failed events. */
  async handleStripeRefund(stripeRefund: Stripe.Refund): Promise<void> {
    const refund = await this.refundModel.findOne({ stripeRefundId: stripeRefund.id });
    if (!refund) return; // not created by us
    await this.applyStripeStatus(refund, stripeRefund);
  }

  /** PAY-03: GET /api/refunds/:id for its owner. */
  async findOne(userId: string, refundId: string): Promise<RefundResponseDto> {
    if (!Types.ObjectId.isValid(refundId)) {
      throw new NotFoundException('Refund not found');
    }
    const refund = await this.refundModel.findById(refundId);
    if (!refund || refund.userId.toString() !== userId) {
      throw new NotFoundException('Refund not found');
    }
    return this.toResponse(refund);
  }

  /** PAY-03: latest refund of a booking, for the booking details (FLT-25, HTL-20). */
  async findByBooking(bookingType: BookingType, bookingId: string | Types.ObjectId): Promise<RefundResponseDto | null> {
    const refund = await this.refundModel
      .findOne({ bookingType, bookingId: new Types.ObjectId(bookingId) })
      .sort({ createdAt: -1 });
    return refund ? this.toResponse(refund) : null;
  }

  private async applyStripeStatus(refund: RefundDocument, stripeRefund: Stripe.Refund): Promise<void> {
    if (stripeRefund.status === 'succeeded') {
      await this.finish(refund, RefundStatus.REFUNDED);
    } else if (stripeRefund.status === 'failed' || stripeRefund.status === 'canceled') {
      await this.finish(refund, RefundStatus.FAILED);
    }
    // 'pending' / 'requires_action' stay Pending.
  }

  /** Move a Pending refund to its final status once, then notify the user. */
  private async finish(refund: RefundDocument, status: RefundStatus.REFUNDED | RefundStatus.FAILED): Promise<void> {
    const processedAt = new Date();
    const updated = await this.refundModel.findOneAndUpdate(
      { _id: refund._id, status: RefundStatus.PENDING },
      { $set: { status, processedAt } },
      { new: true },
    );
    if (!updated) return; // already final (e.g. webhook after the immediate result)
    refund.status = status;
    refund.processedAt = processedAt;

    if (status === RefundStatus.REFUNDED) {
      const payment = await this.paymentModel.findById(refund.paymentId);
      if (payment) {
        payment.status = refund.amount >= payment.amount ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
        await payment.save();
      }
    }

    const amountText = `${refund.amount.toFixed(2)} ${refund.currency}`;
    try {
      await this.notificationsService.create(refund.userId, {
        type: NotificationType.REFUND_PROCESSED,
        title: status === RefundStatus.REFUNDED ? 'Refund completed' : 'Refund failed',
        message:
          status === RefundStatus.REFUNDED
            ? `Your refund of ${amountText} has been completed.`
            : `Your refund of ${amountText} could not be processed.`,
        metadata: {
          refundId: refund.id,
          bookingType: refund.bookingType,
          bookingId: refund.bookingId.toString(),
          status,
        },
      });
    } catch (error) {
      this.logger.error(`Refund notification failed for refund ${refund.id}: ${(error as Error).message}`);
    }
  }

  private async requireCancelledBooking(type: BookingType, bookingId: Types.ObjectId): Promise<void> {
    const exists =
      type === BookingType.FLIGHT
        ? await this.flightBookingModel.exists({ _id: bookingId, status: FlightBookingStatus.CANCELLED })
        : await this.hotelBookingModel.exists({ _id: bookingId, status: HotelBookingStatus.CANCELLED });
    if (!exists) {
      throw new ConflictException('A refund can only be issued for a cancelled booking');
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  private toResponse(refund: RefundDocument): RefundResponseDto {
    return {
      id: refund.id,
      paymentId: refund.paymentId.toString(),
      bookingType: refund.bookingType,
      bookingId: refund.bookingId.toString(),
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      appliedPolicy: refund.appliedPolicy,
      processedAt: refund.processedAt,
    };
  }
}
