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
import { NotificationsModule } from '../notifications/notifications.module';
import { PoliciesModule } from '../policies/policies.module';
import { PaymentExpiryService } from './payment-expiry.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Refund, RefundSchema } from './schemas/refund.schema';
import { stripeProvider } from './stripe.provider';

@Module({
  imports: [
    AuthModule,
    PoliciesModule, // PAY-02: assertAccepted() before payment
    NotificationsModule, // PAY-03 / GEN-01: refund notifications
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
  ],
  controllers: [PaymentsController, RefundsController],
  providers: [stripeProvider, PaymentsService, RefundsService, PaymentExpiryService],
  exports: [MongooseModule, PaymentsService, RefundsService], // RefundsService: used by the cancellation tasks
})
export class PaymentsModule {}
