import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from './schemas/airline.schema';
import { AirportsModule } from '../airports/airports.module';
import { Flight, FlightSchema } from './schemas/flight.schema';
@Module({
  imports: [
    AirportsModule,
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Flight.name, schema: FlightSchema },
    ]),
  ],
})
export class FlightsModule {}
