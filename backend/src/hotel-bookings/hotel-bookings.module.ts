import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelsModule } from '../hotels/hotels.module';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { RoomLock, RoomLockSchema } from './schemas/room-lock.schema';

@Module({
  imports: [
    HotelsModule,
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: RoomLock.name, schema: RoomLockSchema },
    ]),
  ],
  controllers: [HotelBookingsController],
  providers: [HotelBookingsService],
  exports: [MongooseModule, HotelBookingsService],
})
export class HotelBookingsModule {}
