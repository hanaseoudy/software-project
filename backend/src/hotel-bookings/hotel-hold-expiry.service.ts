import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HotelBooking,
  HotelBookingStatus,
} from './schemas/hotel-booking.schema';

/**
 * HTL-18: unpaid holds expire after 10 minutes. Every minute, any
 * PENDING_PAYMENT reservation whose hold has run out is marked EXPIRED, which
 * releases its rooms. (The overlap check in HotelBookingsService also ignores
 * expired holds, so rooms are released even between runs.)
 */
@Injectable()
export class HotelHoldExpiryService {
  private readonly logger = new Logger(HotelHoldExpiryService.name);

  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredHolds(): Promise<number> {
    const result = await this.bookingModel.updateMany(
      {
        status: HotelBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { $lte: new Date() },
      },
      { $set: { status: HotelBookingStatus.EXPIRED } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} hotel hold(s)`);
    }
    return result.modifiedCount;
  }
}
