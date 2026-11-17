import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AccountDeactivationService } from './account-deactivation.service';
import { AccountDeactivationController } from './account-deactivation.controller';
import { User, UserSchema } from './schemas/user.schema';
import {ModeratorAssignment, ModeratorAssignmentSchema,} from './schemas/moderatorassignment.schema';
import { Session, SessionSchema } from '../auth/schemas/session.schema';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/schemas/hotel-booking.schema';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema';
import { Flight, FlightSchema } from '../flights/schemas/flight.schema';
import { Itinerary, ItinerarySchema } from '../itineraries/schemas/itinerary.schema';
import { AuthModule } from '../auth/auth.module';

@Module({ 
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
       {
        name: ModeratorAssignment.name,
        schema: ModeratorAssignmentSchema,
      },
      { name: Session.name, schema: SessionSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: Flight.name, schema: FlightSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
    AuthModule,
  ],
  providers: [UsersService, AccountDeactivationService],
  controllers: [UsersController, AccountDeactivationController]
})
export class UsersModule {}