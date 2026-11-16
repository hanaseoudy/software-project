import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Flight, FlightSchema } from '../flights/schemas/flight.schema';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightCompletionService } from './flight-completion.service';
import { FlightHoldExpiryService } from './flight-hold-expiry.service';
import {
  FlightBooking,
  FlightBookingSchema,
} from './schemas/flight-booking.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
  ],
  controllers: [FlightBookingsController],
  providers: [
    FlightBookingsService,
    FlightHoldExpiryService,
    FlightCompletionService,
  ],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}