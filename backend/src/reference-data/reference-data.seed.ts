import 'reflect-metadata';
import { createConnection, Model } from 'mongoose';
import { Airport, AirportSchema } from '../flights/schemas/airport.schema';
import {
  airports,
  attractions,
  cities,
  countries,
  currencies,
} from './reference-data.data';
import { Attraction, AttractionSchema } from './schemas/attraction.schema';
import { City, CitySchema } from './schemas/city.schema';
import { Country, CountrySchema } from './schemas/country.schema';
import { Currency, CurrencySchema } from './schemas/currency.schema';

class ReferenceDataError extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ReferenceDataError(message);
}

async function validateRecords<T>(model: Model<T>, records: T[], key: keyof T) {
  const identifiers = new Set<unknown>();
  for (const record of records) {
    try {
      await new model(record).validate();
    } catch {
      throw new ReferenceDataError(
        `Invalid ${model.modelName} record: ${String(record[key])}.`,
      );
    }
    check(
      !identifiers.has(record[key]),
      `Duplicate ${model.modelName} identifier: ${String(record[key])}.`,
    );
    identifiers.add(record[key]);
  }
}

function validateRelationships() {
  const countryCodes = new Set(countries.map(({ code }) => code));
  const currencyCodes = new Set(currencies.map(({ code }) => code));
  const cityCountries = new Map(
    cities.map((city) => [city.city_id, city.country_code]),
  );

  for (const country of countries) {
    check(
      currencyCodes.has(country.currency),
      `Unknown currency for country ${country.code}.`,
    );
  }
  for (const city of cities) {
    check(
      countryCodes.has(city.country_code),
      `Unknown country for city ${city.city_id}.`,
    );
  }
  for (const airport of airports) {
    check(
      /^[A-Z]{3}$/.test(airport.iata_code),
      `Invalid airport code: ${airport.iata_code}.`,
    );
    check(
      cityCountries.get(airport.city_id) === airport.country_code,
      `City/country mismatch for airport ${airport.iata_code}.`,
    );
    try {
      new Intl.DateTimeFormat('en', { timeZone: airport.time_zone });
    } catch {
      throw new ReferenceDataError(
        `Invalid time zone for airport ${airport.iata_code}.`,
      );
    }
  }
  for (const attraction of attractions) {
    check(
      cityCountries.has(attraction.city_id),
      `Unknown city for attraction ${attraction.attraction_id}.`,
    );
  }
}

async function upsertRecords<T extends object>(
  model: Model<T>,
  records: T[],
  key: keyof T,
) {
  let inserted = 0;
  for (const record of records) {
    const result = await model.updateOne(
      { [key]: record[key] },
      { $set: record },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    inserted += result.upsertedCount;
  }
  console.log(
    `${model.collection.name}: ${records.length} records processed, ${inserted} inserted.`,
  );
}

async function migrateLegacyAirports(
  model: Model<Airport>,
  officialRecords: Airport[],
) {
  // Read raw documents: the current schema does not declare the spreadsheet fields.
  const existing = await model.collection.find({}).toArray();
  const officialByCode = new Map(
    officialRecords.map((airport) => [airport.iataCode, airport]),
  );
  const aliases = {
    iata_code: 'iataCode',
    city_id: 'city',
    country_code: 'country',
    time_zone: 'timezone',
  } as const;
  const seenCodes = new Set<string>();
  const migrations = [];

  // Check every record before changing any airport. Never merge duplicate airports:
  // other records may refer to either of their MongoDB IDs.
  for (const record of existing) {
    const code = record.iataCode ?? record.iata_code;
    check(
      typeof code === 'string' && /^[A-Z]{3}$/.test(code),
      `Airport ${String(record._id)} has a missing or invalid airport code. Review it before seeding.`,
    );
    check(
      !seenCodes.has(code),
      `Multiple airport records use ${code}. Review them before seeding; no airports were migrated.`,
    );
    seenCodes.add(code);

    const legacyFields = Object.keys(aliases).filter((key) =>
      Object.hasOwn(record, key),
    );
    if (legacyFields.length === 0) continue;

    const official = officialByCode.get(code);
    check(
      !!official,
      `Legacy airport ${code} is not in the official dataset. Review it before seeding.`,
    );
    for (const [legacy, current] of Object.entries(aliases)) {
      const expected = official[current as keyof typeof official];
      for (const field of [legacy, current]) {
        check(
          !Object.hasOwn(record, field) || record[field] === expected,
          `Airport ${code} has a conflicting ${field} value. Review it before seeding; no airports were migrated.`,
        );
      }
    }

    // Include the inspected values in the update filter so a concurrent edit is
    // detected instead of overwritten. Unrelated fields are left untouched.
    const filter: Record<string, unknown> = { _id: record._id };
    for (const field of [...Object.keys(official), ...Object.keys(aliases)]) {
      filter[field] = Object.hasOwn(record, field)
        ? { $eq: record[field], $exists: true }
        : { $exists: false };
    }
    migrations.push({
      code,
      filter,
      values: official,
      unset: Object.fromEntries(legacyFields.map((field) => [field, ''])),
    });
  }

  for (const migration of migrations) {
    const result = await model.collection.updateOne(migration.filter, {
      $set: migration.values,
      $unset: migration.unset,
    });
    check(
      result.matchedCount === 1,
      `Airport ${migration.code} changed during migration. Review the record and rerun; its ID was not replaced.`,
    );
  }
  if (migrations.length > 0) {
    console.log(
      `airports: ${migrations.length} legacy records migrated to schema field names; existing IDs preserved.`,
    );
  }
}

// Standalone setup command: does not start the API or seed application/user data.
export async function seedReferenceData(
  uri: string | undefined,
  dryRun = false,
) {
  const connection = createConnection();
  const currencyModel = connection.model(Currency.name, CurrencySchema);
  const countryModel = connection.model(Country.name, CountrySchema);
  const cityModel = connection.model(City.name, CitySchema);
  const airportModel = connection.model(Airport.name, AirportSchema);
  const attractionModel = connection.model(Attraction.name, AttractionSchema);

  const cityRecords = cities.map(({ city_id, name, country_code }) => ({
    cityId: city_id,
    name,
    countryCode: country_code,
  }));
  const airportRecords = airports.map(
    ({ iata_code, name, city_id, country_code, time_zone }) => ({
      iataCode: iata_code,
      name,
      city: city_id,
      country: country_code,
      timezone: time_zone,
    }),
  );
  const attractionRecords = attractions.map(
    ({ attraction_id, name, city_id }) => ({
      attractionId: attraction_id,
      name,
      cityId: city_id,
    }),
  );

  try {
    // Validate the complete snapshot before connecting or writing any records.
    await validateRecords(currencyModel, currencies, 'code');
    await validateRecords(countryModel, countries, 'code');
    await validateRecords(cityModel, cityRecords, 'cityId');
    await validateRecords(airportModel, airportRecords, 'iataCode');
    await validateRecords(attractionModel, attractionRecords, 'attractionId');
    validateRelationships();

    if (dryRun) {
      console.log(
        `Dry run passed: ${countries.length} countries, ${cities.length} cities, ${airports.length} airports, ${attractions.length} attractions, ${currencies.length} currencies. No database connection or writes.`,
      );
      return;
    }

    check(
      typeof uri === 'string' && uri.trim().length > 0,
      'Set MONGODB_URI to the intended database before seeding.',
    );
    await connection.openUri(uri, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });

    // Convert spreadsheet-shaped records before building the unique iataCode index.
    await migrateLegacyAirports(airportModel, airportRecords);

    // Establish unique identifiers before upserts, including on existing collections.
    // A conflicting pre-existing index/duplicate is reported, never removed automatically.
    for (const model of [
      currencyModel,
      countryModel,
      cityModel,
      airportModel,
      attractionModel,
    ]) {
      try {
        await model.createIndexes();
      } catch {
        throw new ReferenceDataError(
          `Could not create indexes for ${model.collection.name}. Check duplicate identifiers, conflicting indexes and index permissions. No records were deleted.`,
        );
      }
    }

    await upsertRecords(currencyModel, currencies, 'code');
    await upsertRecords(countryModel, countries, 'code');
    await upsertRecords(cityModel, cityRecords, 'cityId');
    await upsertRecords(airportModel, airportRecords, 'iataCode');
    await upsertRecords(attractionModel, attractionRecords, 'attractionId');
    console.log('GEN-12 reference-data seeding complete.');
  } finally {
    await connection.destroy();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run')) {
    console.error('Usage: npm run seed:reference -- [--dry-run]');
    process.exitCode = 1;
  } else {
    seedReferenceData(
      process.env.MONGODB_URI,
      args.includes('--dry-run'),
    ).catch((error: unknown) => {
      // Driver errors may contain connection details; do not print credentials/URIs.
      console.error(
        error instanceof ReferenceDataError
          ? error.message
          : 'Reference-data seed failed. Check database connectivity, write/index permissions and existing duplicate identifiers. Fix the cause and rerun; records are never deleted by this command.',
      );
      process.exitCode = 1;
    });
  }
}
