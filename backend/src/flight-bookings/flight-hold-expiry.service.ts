import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FlightBookingsService } from './flight-bookings.service';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import { PassengerType } from './schemas/passenger.schema';

@Injectable()
export class FlightHoldExpiryService {
  private readonly logger = new Logger(FlightHoldExpiryService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
    private readonly bookingsService: FlightBookingsService,
  ) {}

  /**
   * FLT-22: a booking still PENDING_PAYMENT after its 10-minute hold becomes
   * EXPIRED and its seats are released.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleHolds(): Promise<void> {
    const stale = await this.bookingModel
      .find({
        status: FlightBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { $lte: new Date() },
      })
      .limit(100);

    for (const booking of stale) {
      // Claim the booking atomically so it can never be released twice
      // (e.g. two cron runs overlapping, or a payment confirming at the same moment).
      const claimed = await this.bookingModel.findOneAndUpdate(
        { _id: booking._id, status: FlightBookingStatus.PENDING_PAYMENT },
        { $set: { status: FlightBookingStatus.EXPIRED } },
      );
      if (!claimed) continue;

      const seats = booking.passengers.filter(
        (p) => p.type !== PassengerType.INFANT,
      ).length;

      await this.bookingsService.releaseSeats(
        booking.outboundFlight.toString(),
        booking.cabinClass,
        seats,
      );
      if (booking.returnFlight) {
        await this.bookingsService.releaseSeats(
          booking.returnFlight.toString(),
          booking.cabinClass,
          seats,
        );
      }
      this.logger.log(`Booking ${booking._id} expired, ${seats} seat(s) released`);
    }
  }
}