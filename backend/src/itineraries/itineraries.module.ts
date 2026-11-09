
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';

import {
  Country,
  CountrySchema,
} from '../reference-data/schemas/country.schema';

import {
  Itinerary,
  ItinerarySchema,
} from './schemas/itinerary.schema';

import { ItinerariesController } from './itineraries.controller';
import { ItinerariesService } from './itineraries.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Itinerary.name, schema: ItinerarySchema },
      { name: Country.name, schema: CountrySchema },
    ]),
  ],
  controllers: [ItinerariesController],
  providers: [ItinerariesService],
})
export class ItinerariesModule {}
