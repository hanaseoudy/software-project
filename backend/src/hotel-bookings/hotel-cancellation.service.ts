import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { BookingType } from '../payments/enums/payment.enums';
import { RefundsService, refundQuote } from '../payments/refunds.service';
import {
  CancelReservationDto,
  CancelReservationResultDto,
  CancellationQuoteDto,
} from './dto/cancel-reservation.dto';
import {
  HotelBooking,
  HotelBookingStatus,
} from './schemas/hotel-booking.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

type BookingRow = Pick<
  HotelBooking,
  'hotel' | 'checkIn' | 'totalPrice' | 'currency' | 'status'
> & { _id: Types.ObjectId; bookingReference?: string };
type HotelRow = {
  policies?: {
    cancellationTiers?: { daysBeforeCheckIn: number; refundPercentage: number }[];
  };
};

/**
 * HTL-21: a registered user cancels their own Confirmed reservation as a whole, before the check-in date.
 *
 * 1. GET quote: the refund from the hotel's cancellation tiers (HTL-10) on the full total, via PAY-03's refundQuote.
 * 2. POST cancel: the guest sends the refund amount they were shown. The reservation becomes Cancelled and
 *    its rooms are free again at once, because availability only counts Confirmed reservations and unexpired
 *    holds (HTL-18). Then the refund is created through PAY-03 (RefundsService.issueRefund).
 * Partial cancellation is not supported: there is no way to cancel only some rooms or nights.
 */
@Injectable()
export class HotelCancellationService {
  private readonly logger = new Logger(HotelCancellationService.name);

  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    private readonly refunds: RefundsService,
  ) {}

  async quote(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<CancellationQuoteDto> {
    const { booking, tiers, daysBeforeCheckIn } = await this.load(userId, id, now);
    const result = refundQuote({
      paidAmount: booking.totalPrice,
      daysRemaining: daysBeforeCheckIn,
      hotelTiers: tiers,
    });
    const percent = Number(result.appliedPolicy.refundPercent ?? 0);
    const tierDays = result.appliedPolicy.daysBeforeCheckIn;
    return {
      reservationId: String(booking._id),
      bookingReference: booking.bookingReference ?? null,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      totalPrice: booking.totalPrice,
      currency: booking.currency,
      daysBeforeCheckIn,
      appliedTier:
        typeof tierDays === 'number'
          ? { daysBeforeCheckIn: tierDays, refundPercentage: percent }
          : null,
      refundPercentage: percent,
      refundAmount: result.amount,
    };
  }

  async cancel(
    userId: string,
    id: string,
    dto: CancelReservationDto,
    now: Date = new Date(),
  ): Promise<CancelReservationResultDto> {
    const { booking, tiers, daysBeforeCheckIn } = await this.load(userId, id, now);
    const result = refundQuote({
      paidAmount: booking.totalPrice,
      daysRemaining: daysBeforeCheckIn,
      hotelTiers: tiers,
    });
    if (Math.abs(dto.expectedRefundAmount - result.amount) > 0.001) {
      throw new ConflictException(
        `The refund is now ${result.amount.toFixed(2)} ${booking.currency}, not ${dto.expectedRefundAmount}. Please review the cancellation quote again.`,
      );
    }

    // The reservation must still be Confirmed and still start tomorrow or later: one atomic step, so a
    // double click, the hourly completion job or a second request cannot cancel it twice.
    const tomorrow = new Date(startOfDay(now).getTime() + DAY_MS);
    const cancelled = await this.bookingModel
      .updateOne(
        {
          _id: booking._id,
          user: new Types.ObjectId(userId),
          status: HotelBookingStatus.CONFIRMED,
          checkIn: { $gte: tomorrow },
        },
        { $set: { status: HotelBookingStatus.CANCELLED } },
      )
      .exec();
    if (cancelled.modifiedCount === 0) {
      throw new ConflictException('This reservation can no longer be cancelled');
    }

    let refund = null;
    let refundError: string | null = null;
    try {
      refund = await this.refunds.issueRefund({
        bookingType: BookingType.HOTEL,
        bookingId: booking._id,
        amount: result.amount,
        appliedPolicy: result.appliedPolicy,
        reason: `Reservation ${booking.bookingReference ?? String(booking._id)} cancelled by the guest`,
      });
    } catch (error) {
      // The reservation is cancelled and its rooms are free; only the money transfer needs another try.
      this.logger.error(
        `Refund for cancelled hotel reservation ${String(booking._id)} could not be started: ${(error as Error).message}`,
      );
      refundError =
        'The reservation is cancelled, but the refund could not be started. Please contact support.';
    }

    return {
      id: String(booking._id),
      bookingReference: booking.bookingReference ?? null,
      status: HotelBookingStatus.CANCELLED,
      refundAmount: result.amount,
      currency: booking.currency,
      refund,
      refundError,
    };
  }

  private async load(userId: string, id: string, now: Date) {
    const notFound = new NotFoundException('Reservation not found');
    if (!isValidObjectId(id)) throw notFound;
    const booking = await this.bookingModel
      .findOne({ _id: new Types.ObjectId(id), user: new Types.ObjectId(userId) })
      .lean<BookingRow>()
      .exec();
    if (!booking) throw notFound; // another guest's reservation is a 404 too

    if (booking.status !== HotelBookingStatus.CONFIRMED) {
      throw new ConflictException(
        booking.status === HotelBookingStatus.CANCELLED
          ? 'This reservation is already cancelled'
          : 'Only a Confirmed reservation can be cancelled',
      );
    }
    const daysBeforeCheckIn = Math.round(
      (startOfDay(booking.checkIn).getTime() - startOfDay(now).getTime()) / DAY_MS,
    );
    if (daysBeforeCheckIn < 1) {
      throw new ConflictException(
        'A reservation can only be cancelled before its check-in date',
      );
    }

    const hotel = await this.hotelModel
      .findById(booking.hotel)
      .select('policies')
      .lean<HotelRow>()
      .exec();
    return {
      booking,
      tiers: hotel?.policies?.cancellationTiers ?? [],
      daysBeforeCheckIn,
    };
  }
}
