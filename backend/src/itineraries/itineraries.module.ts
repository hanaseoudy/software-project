import { FlightsModule } from '../flights/flights.module';
import { AirportsModule } from '../airports/airports.module';
import { ItineraryFlightsController } from './itinerary-flights.controller';
import { ItineraryFlightsService } from './itinerary-flights.service';
import { HotelsModule } from '../hotels/hotels.module';
import { ItineraryHotelsController } from './itinerary-hotels.controller';
import { ItineraryHotelsService } from './itinerary-hotels.service';
import { BudgetEntriesController } from './budget-entries.controller';
import { BudgetEntriesService } from './budget-entries.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';

import {
  Country,
  CountrySchema,
} from '../reference-data/schemas/country.schema';

import {
  Itinerary,
  ItinerarySchema,
} from './schemas/itinerary.schema';

import {
  ItineraryDay,
  ItineraryDaySchema,
} from './schemas/itinerary-day.schema';

import {
  Activity,
  ActivitySchema,
} from './schemas/activity.schema';

import {
  BudgetEntry,
  BudgetEntrySchema,
} from './schemas/budget-entry.schema';

import {
  TransportCost,
  TransportCostSchema,
} from './schemas/transport-cost.schema';

import {
  City,
  CitySchema,
} from '../reference-data/schemas/city.schema';

import { Currency, CurrencySchema } from '../reference-data/schemas/currency.schema';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { TransportCostsController } from './transport-costs.controller';
import { TransportCostsService } from './transport-costs.service';
import { ItinerariesController } from './itineraries.controller';
import { PublicItinerariesController, PublicItineraryCloneController } from './public-itineraries.controller';
import { ItinerariesService } from './itineraries.service';
import { ItineraryExportController } from './itinerary-export.controller';
import { ItineraryExportService } from './itinerary-export.service';

@Module({
  imports: [
    AuthModule,
    FlightsModule,
    AirportsModule,
    HotelsModule,
    UploadsModule,
    MongooseModule.forFeature([
      { name: Currency.name, schema: CurrencySchema },
      {
        name: Itinerary.name,
        schema: ItinerarySchema,
      },
      {
        name: Country.name,
        schema: CountrySchema,
      },
      {
        name: ItineraryDay.name,
        schema: ItineraryDaySchema,
      },
      {
        name: Activity.name,
        schema: ActivitySchema,
      },
      {
        name: BudgetEntry.name,
        schema: BudgetEntrySchema,
      },
      {
        name: TransportCost.name,
        schema: TransportCostSchema,
      },
      {
        name: City.name,
        schema: CitySchema,
      },
    ]),
  ],
 controllers: [
    ItineraryHotelsController,
    ItineraryFlightsController,
    BudgetEntriesController,
    PublicItinerariesController,
    PublicItineraryCloneController,
    ItinerariesController,
    ActivitiesController,
    TransportCostsController,
    ItineraryExportController,
  ],
  providers: [ItineraryHotelsService, ItineraryFlightsService, BudgetEntriesService, ItinerariesService, ActivitiesService, TransportCostsService, ItineraryExportService],
})
export class ItinerariesModule {}
