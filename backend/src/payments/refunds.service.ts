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
import { refundPercentFor } from '../common/utils/refund-calculator';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundResponseDto } from './dto/refund-response.dto';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Refund, RefundDocument } from './schemas/refund.schema';
import { STRIPE_CLIENT } from './stripe.provider';

/** A flight cancellation tier (FLT-09, Airline.cancellationPolicy.rules). */
export interface FlightCancellationTier {
  daysBeforeDeparture: number;
  refundPercent: number;
}

/** A hotel cancellation tier (HTL-10, Hotel.policies.cancellationTiers). */
export interface HotelCancellationTier {
  daysBeforeCheckIn: number;
  refundPercentage: number;
}

/** Result of refundQuote(): pass both fields to issueRefund(). */
export interface RefundQuote {
  amount: number;
  appliedPolicy: Record<string, unknown>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** appliedPolicy.kind of the refund of a fare difference (FLT-27): the payment itself stays Succeeded. */
export const FARE_DIFFERENCE_REFUND = 'fare-difference';

/**
 * PAY-03 / project description 6.4: refund amount for a cancellation, following the policy of the booking.
 * Uses FLT-09's refundPercentFor for both flights and hotels, so every cancellation task (FLT-26, HTL-21,
 * FLT-06, ...) calculates it the same way:
 *
 *   // FLT-26 user cancellation (airline tiers, FLT-09)
 *   refundQuote({ paidAmount: payment.amount, daysRemaining, flightTiers: airline.cancellationPolicy.rules })
 *   // HTL-21 user cancellation (hotel tiers, HTL-10)
 *   refundQuote({ paidAmount: payment.amount, daysRemaining, hotelTiers: hotel.policies.cancellationTiers })
 *   // FLT-06 / provider-initiated cancellation: always 100%
 *   refundQuote({ paidAmount: payment.amount, providerInitiated: true })
 *
 * `daysRemaining` = whole days from now until departure (flights) or check-in (hotels).
 */
export function refundQuote(input: {
  paidAmount: number;
  daysRemaining?: number;
  flightTiers?: FlightCancellationTier[];
  hotelTiers?: HotelCancellationTier[];
  providerInitiated?: boolean;
}): RefundQuote {
  if (input.providerInitiated) {
    return { amount: round2(input.paidAmount), appliedPolicy: { refundPercent: 100, rule: 'provider-initiated cancellation' } };
  }
  const daysRemaining = Math.max(0, Math.floor(input.daysRemaining ?? 0));
  const rules = input.flightTiers
    ? input.flightTiers.map((t) => ({ daysBeforeDeparture: t.daysBeforeDeparture, refundPercent: t.refundPercent }))
    : (input.hotelTiers ?? []).map((t) => ({ daysBeforeDeparture: t.daysBeforeCheckIn, refundPercent: t.refundPercentage }));
  const refundPercent = refundPercentFor(daysRemaining, rules);
  const tier = rules
    .filter((r) => r.daysBeforeDeparture <= daysRemaining)
    .sort((a, b) => b.daysBeforeDeparture - a.daysBeforeDeparture)[0];
  const dayField = input.flightTiers ? 'daysBeforeDeparture' : 'daysBeforeCheckIn';
  return {
    amount: round2((input.paidAmount * refundPercent) / 100),
    appliedPolicy: {
      source: input.flightTiers ? 'FLT-09 airline cancellation tiers' : 'HTL-10 hotel cancellation tiers',
      daysRemaining,
      ...(tier ? { [dayField]: tier.daysBeforeDeparture } : {}),
      refundPercent,
    },
  };
}

/**
 * PAY-03 input from the cancellation tasks (FLT-26, HTL-21, FLT-06, ...).
 *
 * How to fill it (project description 6.4: the refund follows the policy applicable to the booking):
 * - User cancellations: compute `amount` and `appliedPolicy` with refundQuote(), i.e. FLT-09's
 *   refundPercentFor with the airline tiers (FLT-09) or the hotel tiers (HTL-10), and pass the tier used
 *   as `appliedPolicy`. Show the user the amount before they confirm the cancellation.
 * - Provider-initiated cancellations (e.g. FLT-06 flight cancelled): 100% of the paid amount,
 *   refundQuote({ paidAmount, providerInitiated: true }).
 * - Set the booking to Cancelled first; a refund is only issued for a cancelled booking.
 * - An amount of 0 (0% tier) issues no refund and returns null.
 * - Only one refund per booking: a second call while one is Pending or Refunded is rejected (409).
 */
export interface IssueRefundInput {
  bookingType: BookingType;
  bookingId: string | Types.ObjectId;
  /** Refund amount in major units (e.g. dollars), from refundQuote(); must be >= 0 and <= the amount paid. */
  amount: number;
  /** The tier/policy used to compute the amount (refundQuote().appliedPolicy), stored with the refund. */
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
    const amount = round2(input.amount);
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
    // Atomic claim: two requests at the same moment (double click, a re-sent webhook) cannot both refund.
    if (!(await this.claim(payment))) {
      throw new ConflictException('This booking already has a refund');
    }

    return this.createRefund(stripe, payment, amount, input.appliedPolicy, input.reason);
  }

  /**
   * FLT-27: refund of the lower fare when a user changes a CONFIRMED flight booking to a cheaper one.
   * The booking stays Confirmed, so this does not use the cancelled-booking rule or the one-refund claim of
   * issueRefund(), and it leaves the payment as Succeeded (a later cancellation, FLT-26, still works).
   */
  async issueFareDifferenceRefund(input: {
    bookingId: string | Types.ObjectId;
    amount: number;
    reason?: string;
    appliedPolicy?: Record<string, unknown>;
  }): Promise<RefundResponseDto | null> {
    const amount = round2(input.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Refund amount must be zero or positive');
    }
    if (amount === 0) return null;

    const stripe = this.requireStripe();
    const payment = await this.paymentModel.findOne({
      bookingType: BookingType.FLIGHT,
      bookingId: new Types.ObjectId(input.bookingId),
      status: PaymentStatus.SUCCEEDED,
    });
    if (!payment?.stripePaymentIntentId) {
      throw new ConflictException('No successful payment found for this booking');
    }
    if (amount > payment.amount) {
      throw new BadRequestException('Refund amount cannot be more than the amount paid');
    }
    return this.createRefund(
      stripe,
      payment,
      amount,
      { ...input.appliedPolicy, kind: FARE_DIFFERENCE_REFUND },
      input.reason,
    );
  }

  /**
   * Money was taken but the booking was not confirmed (amount mismatch, paid after the hold ended,
   * or the hotel/airline was deactivated). The booking stays unconfirmed and the full amount is returned.
   */
  async refundUnconfirmedPayment(payment: PaymentDocument, amountReceived: number, reason: string): Promise<void> {
    if (!this.stripe || amountReceived <= 0) return;
    if (!(await this.claim(payment))) return; // already being refunded (e.g. Stripe re-sent the webhook)
    const amount = round2(amountReceived);
    await this.createRefund(this.stripe, payment, amount, { refundPercent: 100, rule: 'booking not confirmed' }, reason);
  }

  /**
   * Marks the payment as being refunded, atomically: only one caller can win, so a payment is never
   * refunded twice. The flag is cleared only if the refund ends as Failed, so it can be retried.
   */
  private async claim(payment: PaymentDocument): Promise<boolean> {
    const claimed = await this.paymentModel.findOneAndUpdate(
      { _id: payment._id, refundInProgress: { $ne: true } },
      { $set: { refundInProgress: true } },
    );
    return !!claimed;
  }

  /**
   * PAY-03: re-check refunds still Pending after `olderThanMs`, in case Stripe's
   * webhook was missed, so no refund stays Pending forever.
   */
  async syncPendingRefunds(olderThanMs = 10 * 60_000): Promise<number> {
    if (!this.stripe) return 0;
    const pending = await this.refundModel.find({
      status: RefundStatus.PENDING,
      stripeRefundId: { $exists: true },
      createdAt: { $lte: new Date(Date.now() - olderThanMs) },
    });
    let updated = 0;
    for (const refund of pending) {
      try {
        const stripeRefund = await this.stripe.refunds.retrieve(refund.stripeRefundId!);
        const before = refund.status;
        await this.applyStripeStatus(refund, stripeRefund);
        if (refund.status !== before) updated += 1;
      } catch (error) {
        this.logger.warn(`Could not re-check refund ${refund.id}: ${(error as Error).message}`);
      }
    }
    return updated;
  }

  private async createRefund(
    stripe: Stripe,
    payment: PaymentDocument,
    amount: number,
    appliedPolicy: Record<string, unknown> | undefined,
    reason: string | undefined,
  ): Promise<RefundResponseDto> {
    let refund: RefundDocument;
    try {
      refund = await this.refundModel.create({
        paymentId: payment._id,
        userId: payment.userId,
        bookingType: payment.bookingType,
        bookingId: payment.bookingId,
        amount,
        currency: payment.currency,
        status: RefundStatus.PENDING,
        reason,
        appliedPolicy,
      });

      if (payment.bookingType === BookingType.FLIGHT) {
        // Flight bookings have a refund reference in their schema; hotel refunds are found by booking.
        await this.flightBookingModel.updateOne({ _id: payment.bookingId }, { $set: { refund: refund._id } });
      }
    } catch (error) {
      // Nothing was sent to Stripe: release the claim so the refund can be tried again.
      await this.paymentModel.updateOne({ _id: payment._id }, { $set: { refundInProgress: false } });
      throw error;
    }

    try {
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId!,
        amount: Math.round(amount * 100),
        metadata: { refundId: refund.id, bookingType: payment.bookingType, bookingId: payment.bookingId.toString() },
      });
      refund.stripeRefundId = stripeRefund.id;
      await refund.save();
      // Test mode often finishes at once; otherwise the webhook (or the re-check) finishes it later.
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
      { returnDocument: 'after' },
    );
    if (!updated) return; // already final (e.g. webhook after the immediate result)
    refund.status = status;
    refund.processedAt = processedAt;

    if (status === RefundStatus.REFUNDED) {
      const payment = await this.paymentModel.findById(refund.paymentId);
      // FLT-27: a fare-difference refund keeps the booking, so its payment stays Succeeded.
      if (payment && refund.appliedPolicy?.kind !== FARE_DIFFERENCE_REFUND) {
        payment.status = refund.amount >= payment.amount ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
        await payment.save();
      }
    } else {
      // Failed: release the claim so the refund can be tried again.
      await this.paymentModel.updateOne({ _id: refund.paymentId }, { $set: { refundInProgress: false } });
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
