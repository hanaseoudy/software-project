import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CitiesController } from './cities.controller';
import { CountriesController } from './countries.controller';
import { ReferenceDataService } from './reference-data.service';
import { City, CitySchema } from './schemas/city.schema';
import { Country, CountrySchema } from './schemas/country.schema';

// BE-1: read-only access to the GEN-12 countries and cities
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
