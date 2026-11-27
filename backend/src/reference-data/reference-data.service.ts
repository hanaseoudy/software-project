import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { CityResponseDto } from './dto/city-response.dto';
import { CountryResponseDto } from './dto/country-response.dto';
import { cities, countries } from './reference-data.data';
import { City } from './schemas/city.schema';
import { Country } from './schemas/country.schema';

// GEN-12: only the official reference records are listed (same rule as GET /api/airports),
// so test records in the shared database never show up in pickers and filters.
const countryCodes = countries.map(({ code }) => code);
const cityIds = cities.map(({ city_id }) => city_id);

@Injectable()
export class ReferenceDataService {
  constructor(
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
  ) {}

  // GET /api/countries
  async listCountries(page = 1) {
    const filter = { code: { $in: countryCodes } };
    const [records, total] = await Promise.all([
      this.countryModel.find(filter).sort({ name: 1, _id: 1 }).skip(skipFor(page)).limit(PAGE_SIZE).lean().exec(),
      this.countryModel.countDocuments(filter).exec(),
    ]);
    const items: CountryResponseDto[] = records.map((c) => ({
      id: c._id.toString(),
      code: c.code,
      name: c.name,
      currency: c.currency,
    }));
    return paginate(items, total, page);
  }

  // GET /api/cities?country=
  async listCities(page = 1, country?: string) {
    const filter: Record<string, unknown> = { cityId: { $in: cityIds } };
    if (country) {
      const code = await this.countryCodeFor(country);
      if (!code) return paginate<CityResponseDto>([], 0, page);
      filter.countryCode = code;
    }
    const [records, total] = await Promise.all([
      this.cityModel.find(filter).sort({ name: 1, _id: 1 }).skip(skipFor(page)).limit(PAGE_SIZE).lean().exec(),
      this.cityModel.countDocuments(filter).exec(),
    ]);
    const items: CityResponseDto[] = records.map((c) => ({
      id: c._id.toString(),
      cityId: c.cityId,
      name: c.name,
      countryCode: c.countryCode,
    }));
    return paginate(items, total, page);
  }

  /** Accepts a country code (EG) or a country id; returns the code, or null if it is not a listed country. */
  private async countryCodeFor(country: string): Promise<string | null> {
    if (/^[A-Za-z]{2}$/.test(country)) {
      const code = country.toUpperCase();
      return countryCodes.includes(code) ? code : null;
    }
    if (!Types.ObjectId.isValid(country)) return null;
    const record = await this.countryModel
      .findOne({ _id: new Types.ObjectId(country), code: { $in: countryCodes } })
      .select('code')
      .lean()
      .exec();
    return record?.code ?? null;
  }
}
