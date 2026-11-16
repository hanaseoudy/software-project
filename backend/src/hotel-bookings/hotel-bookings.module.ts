import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { HotelsModule } from '../hotels/hotels.module';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelCompletionService } from './hotel-completion.service';
import { HotelHoldExpiryService } from './hotel-hold-expiry.service';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { RoomLock, RoomLockSchema } from './schemas/room-lock.schema';

@Module({
  imports: [
    AuthModule,
    HotelsModule,
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: RoomLock.name, schema: RoomLockSchema },
    ]),
  ],
  controllers: [HotelBookingsController],
  providers: [
    HotelBookingsService,
    HotelHoldExpiryService,
    HotelCompletionService,
  ],
  exports: [MongooseModule, HotelBookingsService],
})
export class HotelBookingsModule {}
