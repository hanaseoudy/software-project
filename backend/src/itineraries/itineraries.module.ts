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
  controllers: [PublicItinerariesController, PublicItineraryCloneController, ItinerariesController, ActivitiesController, TransportCostsController, ItineraryExportController],
  providers: [ItinerariesService, ActivitiesService, TransportCostsService, ItineraryExportService],
})
export class ItinerariesModule {}
