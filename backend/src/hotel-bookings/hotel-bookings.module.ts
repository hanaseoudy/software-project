import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { HotelBookingConfirmationService } from './hotel-booking-confirmation.service';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { Review, ReviewSchema } from './schemas/review.schema';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  ],
  providers: [HotelBookingConfirmationService],
  exports: [MongooseModule, HotelBookingConfirmationService],
})
export class HotelBookingsModule {}
