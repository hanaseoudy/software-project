import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from './schemas/airline.schema';
import { Airport, AirportSchema } from '../airports/schemas/airport.schema';
import { Flight, FlightSchema } from './schemas/flight.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentSchema,
} from '../users/schemas/moderatorassignment.schema';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { JwtService } from '@nestjs/jwt';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Flight.name, schema: FlightSchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
    ]),
  ],
  controllers: [FlightsController],
  providers: [JwtService, FlightsService],
})
export class FlightsModule {}
