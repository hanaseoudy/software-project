import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Flight, FlightSchema } from '../flights/schemas/flight.schema';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightHoldExpiryService } from './flight-hold-expiry.service';
import {
  FlightBooking,
  FlightBookingSchema,
} from './schemas/flight-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
  ],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService, FlightHoldExpiryService],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}