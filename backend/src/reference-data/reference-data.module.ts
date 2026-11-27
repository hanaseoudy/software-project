import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CitiesController } from './cities.controller';
import { CountriesController } from './countries.controller';
import { ReferenceDataService } from './reference-data.service';
import { City, CitySchema } from './schemas/city.schema';
import { Country, CountrySchema } from './schemas/country.schema';

// Read-only access to the seeded reference countries and cities (GEN-12, HTL-01, HTL-11, ITN-01, ITN-05, ITN-16, ITN-21)
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: City.name, schema: CitySchema },
    ]),
  ],
  controllers: [CountriesController, CitiesController],
  providers: [ReferenceDataService],
})
export class ReferenceDataModule {}
