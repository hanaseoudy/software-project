import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HotelBooking,
  HotelBookingStatus,
} from './schemas/hotel-booking.schema';

/**
 * GEN-11: a CONFIRMED hotel reservation becomes COMPLETED once its check-out
 * date has passed. Runs hourly. Filtering on status CONFIRMED means no other
 * transition (e.g. PENDING_PAYMENT, CANCELLED, EXPIRED) can ever happen here.
 */
@Injectable()
export class HotelCompletionService {
  private readonly logger = new Logger(HotelCompletionService.name);

  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async completeFinishedStays(now: Date = new Date()): Promise<number> {
    const result = await this.bookingModel.updateMany(
      {
        status: HotelBookingStatus.CONFIRMED,
        checkOut: { $lte: now },
      },
      { $set: { status: HotelBookingStatus.COMPLETED } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Completed ${result.modifiedCount} hotel reservation(s)`);
    }
    return result.modifiedCount;
  }
}
