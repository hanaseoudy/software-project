import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airline } from '../airlines/schemas/airline.schema';
import {
  assertBookingTransition,
  BookingStatus,
} from '../common/booking-status/booking-state-transitions';
import { Flight } from '../flights/schemas/flight.schema';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingType, PaymentStatus } from '../payments/enums/payment.enums';
import { Payment } from '../payments/schemas/payment.schema';
import { RefundsService, refundQuote } from '../payments/refunds.service';
import { CancelFlightBookingDto } from './dto/cancel-flight-booking.dto';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import { PassengerType } from './schemas/passenger.schema';
import { hasDeparted, wholeDaysUntil } from './utils/flight-cancellation';
import { chargeTotal } from './utils/flight-change';

/**
 * FLT-26: a registered user cancels their own CONFIRMED flight booking before
 * departure, after seeing the refund amount from the airline's cancellation
 * tiers (FLT-09). The booking becomes CANCELLED, its seats go back to the
 * inventory and a refund is created (PAY-03).
 */
@Injectable()
export class FlightCancellationService {
  private readonly logger = new Logger(FlightCancellationService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    private readonly refundsService: RefundsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** What the user is shown before confirming: how much would be refunded. */
  async getQuote(userId: string, bookingId: string, now: Date = new Date()) {
    const { quote, paidAmount, currency, departureTime } = await this.loadQuote(
      userId,
      bookingId,
      now,
    );
    return {
      bookingId,
      departureTime,
      paidAmount,
      currency,
      refundAmount: quote.amount,
      refundPercent: quote.appliedPolicy.refundPercent,
      appliedPolicy: quote.appliedPolicy,
    };
  }

  async cancel(
    userId: string,
    bookingId: string,
    dto: CancelFlightBookingDto,
    now: Date = new Date(),
  ) {
    if (dto.confirm !== true) {
      throw new BadRequestException(
        'Confirm the cancellation after viewing the refund amount (confirm must be true)',
      );
    }
    const { booking, quote, currency } = await this.loadQuote(
      userId,
      bookingId,
      now,
    );
    assertBookingTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED);

    // One atomic update: only one request can cancel the booking, so its
    // seats are returned and its refund is created exactly once.
    const cancelled = await this.bookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        user: booking.user,
        status: FlightBookingStatus.CONFIRMED,
      },
      {
        $set: {
          status: FlightBookingStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: 'Cancelled by the user',
        },
      },
      { returnDocument: 'after' },
    );
    if (!cancelled) {
      throw new ConflictException('Only a confirmed booking can be cancelled');
    }

    await this.returnSeats(booking);
    const refund = await this.createRefund(bookingId, quote);
    await this.notifyCancelled(booking, quote.amount, currency);

    return {
      bookingId,
      status: FlightBookingStatus.CANCELLED,
      cancelledAt: now,
      refund: refund
        ? {
            id: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
          }
        : null,
      refundAmount: quote.amount,
      appliedPolicy: quote.appliedPolicy,
      ...(quote.amount > 0 && !refund
        ? {
            warning:
              'The booking is cancelled but the refund could not be created automatically. Please contact support.',
          }
        : {}),
    };
  }

  private async loadQuote(userId: string, bookingId: string, now: Date) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    const booking = await this.bookingModel.findOne({
      _id: new Types.ObjectId(bookingId),
      user: new Types.ObjectId(userId),
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== FlightBookingStatus.CONFIRMED) {
      throw new ConflictException('Only a confirmed booking can be cancelled');
    }

    const outbound = await this.flightModel.findById(booking.outboundFlight);
    if (!outbound) {
      throw new NotFoundException('Flight of this booking no longer exists');
    }
    if (hasDeparted(outbound.departureTime, now)) {
      throw new ConflictException(
        'Cancellation is not possible after departure',
      );
    }

    const payment = await this.paymentModel.findOne({
      bookingType: BookingType.FLIGHT,
      bookingId: booking._id,
      status: PaymentStatus.SUCCEEDED,
    });
    if (!payment) {
      throw new ConflictException(
        'No successful payment found for this booking',
      );
    }

    // FLT-27: after a flight change the booking is worth its current total, not what was first paid
    // (a cheaper flight was already refunded). A higher fare paid later is on a separate Stripe payment, so
    // the refund can never be more than the original payment.
    const paidAmount = Math.min(
      payment.amount,
      chargeTotal(booking.totalPrice, booking.baggageFees),
    );

    // The refund follows the tiers of the airline operating the outbound flight.
    const airline = await this.airlineModel.findById(outbound.airline);
    const quote = refundQuote({
      paidAmount,
      daysRemaining: wholeDaysUntil(outbound.departureTime, now),
      flightTiers: airline?.cancellationPolicy?.rules ?? [],
    });

    return {
      booking,
      quote,
      paidAmount,
      currency: payment.currency,
      departureTime: outbound.departureTime,
    };
  }

  /**
   * Gives the seats back. After FLT-23 the seats of a confirmed booking are
   * "booked"; a booking whose reference was not generated yet still has them
   * "held".
   */
  private async returnSeats(booking: FlightBooking): Promise<void> {
    const seats = booking.passengers.filter(
      (p) => p.type !== PassengerType.INFANT,
    ).length;
    const counter = booking.bookingReference ? 'bookedSeats' : 'heldSeats';
    const flightIds = [booking.outboundFlight, booking.returnFlight].filter(
      (f): f is Types.ObjectId => !!f,
    );
    for (const flightId of flightIds) {
      const result = await this.flightModel.updateOne(
        { _id: flightId },
        { $inc: { [`cabins.$[c].${counter}`]: -seats } },
        {
          arrayFilters: [
            {
              'c.cabinClass': booking.cabinClass,
              [`c.${counter}`]: { $gte: seats },
            },
          ],
        },
      );
      if (result.modifiedCount !== 1) {
        this.logger.error(
          `Booking ${String(booking._id)} cancelled but ${seats} seat(s) could not be returned on flight ${String(flightId)}`,
        );
      }
    }
  }

  /** The booking is already cancelled, so a refund problem is reported, not thrown. */
  private async createRefund(
    bookingId: string,
    quote: ReturnType<typeof refundQuote>,
  ) {
    try {
      return await this.refundsService.issueRefund({
        bookingType: BookingType.FLIGHT,
        bookingId,
        amount: quote.amount,
        appliedPolicy: quote.appliedPolicy,
        reason: 'Flight booking cancelled by the user',
      });
    } catch (error) {
      this.logger.error(
        `Booking ${bookingId} cancelled but the refund failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async notifyCancelled(
    booking: FlightBooking,
    refundAmount: number,
    currency: string,
  ): Promise<void> {
    try {
      await this.notificationsService.create(booking.user, {
        type: NotificationType.BOOKING_CANCELLED,
        title: 'Flight booking cancelled',
        message:
          `Your flight booking ${booking.bookingReference ?? String(booking._id)} was cancelled. ` +
          (refundAmount > 0
            ? `A refund of ${refundAmount} ${currency} is on its way.`
            : 'No refund applies under the airline policy.'),
        metadata: {
          bookingId: String(booking._id),
          bookingReference: booking.bookingReference,
          refundAmount,
          currency,
        },
      });
    } catch (error) {
      this.logger.error(
        `Booking ${String(booking._id)} cancelled but notification failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
