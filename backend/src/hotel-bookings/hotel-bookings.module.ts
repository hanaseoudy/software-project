import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { HotelsModule } from '../hotels/hotels.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { HotelBookingConfirmationService } from './hotel-booking-confirmation.service';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelCompletionService } from './hotel-completion.service';
import { HotelHoldExpiryService } from './hotel-hold-expiry.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { RoomLock, RoomLockSchema } from './schemas/room-lock.schema';

@Module({
  imports: [
    AuthModule,
    HotelsModule,
    NotificationsModule,
    PaymentsModule, // PaymentsService: HTL-17 registers on its booking-confirmed hook
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: RoomLock.name, schema: RoomLockSchema },
    ]),
  ],
  controllers: [HotelBookingsController, ReviewsController],
  providers: [
    HotelBookingsService,
    HotelHoldExpiryService,
    HotelBookingConfirmationService,
    HotelCompletionService,
    ReviewsService, // HTL-23
  ],
  exports: [MongooseModule, HotelBookingsService, HotelBookingConfirmationService],
})
export class HotelBookingsModule {}
