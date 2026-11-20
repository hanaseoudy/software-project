import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { Airport, AirportSchema } from '../airports/schemas/airport.schema';
import { Flight, FlightSchema } from './schemas/flight.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentSchema,
} from '../users/schemas/moderatorassignment.schema';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { AuthModule } from '../auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  FlightBooking,
  FlightBookingSchema,
} from '../flight-bookings/schemas/flight-booking.schema';
import { PaymentsModule } from '../payments/payments.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Flight.name, schema: FlightSchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
    AuthModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [FlightsController],
  providers: [FlightsService],
  exports: [FlightsService], // <-- Must be exported so ItinerariesModule can inject it
})
export class FlightsModule {}