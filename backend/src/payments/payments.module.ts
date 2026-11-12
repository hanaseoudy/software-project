import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  FlightBooking,
  FlightBookingSchema,
} from '../flight-bookings/schemas/flight-booking.schema';
import {
  HotelBooking,
  HotelBookingSchema,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { PaymentExpiryService } from './payment-expiry.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Refund, RefundSchema } from './schemas/refund.schema';
import { stripeProvider } from './stripe.provider';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
      // PAY-01 reads and confirms bookings directly from their schemas.
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
    AuthModule, // JwtAuthGuard
  ],
  controllers: [PaymentsController],
  providers: [stripeProvider, PaymentsService, PaymentExpiryService],
  exports: [MongooseModule, PaymentsService],
})
export class PaymentsModule {}
