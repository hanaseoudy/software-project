import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { Airport, AirportSchema } from '../airports/schemas/airport.schema';
import { Flight, FlightSchema } from '../flights/schemas/flight.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { FlightBookingConfirmationService } from './flight-booking-confirmation.service';
import { FlightCancellationService } from './flight-cancellation.service';
import { FlightChangeService } from './flight-change.service';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightCompletionService } from './flight-completion.service';
import { FlightHoldExpiryService } from './flight-hold-expiry.service';
import {
  FlightBooking,
  FlightBookingSchema,
} from './schemas/flight-booking.schema';
import { FlightChange, FlightChangeSchema } from './schemas/flight-change.schema';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    PaymentsModule, // PaymentsService: FLT-23 registers on its booking-confirmed hook
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: Airline.name, schema: AirlineSchema },
      { name: Airport.name, schema: AirportSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: FlightChange.name, schema: FlightChangeSchema },
    ]),
  ],
  controllers: [FlightBookingsController],
  providers: [
    FlightBookingsService,
    FlightHoldExpiryService,
    FlightCompletionService,
    FlightBookingConfirmationService,
    FlightCancellationService,
    FlightChangeService,
  ],
  exports: [FlightBookingsService, FlightBookingConfirmationService],
})
export class FlightBookingsModule {}