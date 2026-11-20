import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { SwaggerModule } from '@nestjs/swagger';
import { fromZonedTime } from 'date-fns-tz';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { ItinerariesModule } from '../src/itineraries/itineraries.module';
import { ItinerariesService } from '../src/itineraries/itineraries.service';
import { ItineraryFlightsService } from '../src/itineraries/itinerary-flights.service';
import { FlightsService } from '../src/flights/flights.service';
import { ItineraryTripType } from '../src/itineraries/dto/itinerary-flight-search-query.dto';
import { airports, cities } from '../src/reference-data/reference-data.data';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { createSwaggerConfig } from '../src/common/swagger.config';

// Only this isolated test module extends the canonical list. Production GEN-12
// data remains unchanged. London has THREE eligible airports for all-set tests.
jest.mock('../src/reference-data/reference-data.data', () => {
  const actual = jest.requireActual(
    '../src/reference-data/reference-data.data',
  );
  return {
    ...actual,
    airports: [
      ...actual.airports,
      {
        iata_code: 'LGW',
        name: 'Synthetic Gatwick',
        city_id: 'london',
        country_code: 'GB',
        time_zone: 'Europe/London',
      },
      {
        iata_code: 'STN',
        name: 'Synthetic Stansted',
        city_id: 'london',
        country_code: 'GB',
        time_zone: 'Europe/London',
      },
    ],
  };
});

describe('ITN-26 isolated flight search and legacy integration', () => {
  let app: INestApplication,
    db: Connection,
    owner: string,
    auth: string[],
    other: string[],
    airline: Types.ObjectId;
  let itineraries: ItinerariesService,
    bridge: ItineraryFlightsService,
    searches: FlightsService;
  let ports: Map<string, { _id: Types.ObjectId; timezone: string }>;
  let counter = 0;
  const date = (value: string) => new Date(value + 'T00:00:00Z');
  const login = async (email: string) => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'ITN26',
        lastName: 'Tester',
        email,
        password: 'TestPassword123',
        acceptTerms: true,
      })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'TestPassword123' })
      .expect(200);
    return (response.headers['set-cookie'] as unknown as string[]).map(
      (cookie) => cookie.split(';')[0],
    );
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(process.env.MONGODB_URI!, {
          monitorCommands: true,
        }),
        ItinerariesModule,
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    db = app.get<Connection>(getConnectionToken());
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
    expect((await db.db!.admin().command({ hello: 1 })).setName).toBeTruthy();
    for (const model of Object.values(db.models)) await model.init();
    auth = await login('itn26-owner@example.com');
    other = await login('itn26-other@example.com');
    owner = (await db
      .model('User')
      .findOne({ email: 'itn26-owner@example.com' }))!._id.toString();
    await db.model('Country').create([
      { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
      { code: 'EG', name: 'Egypt', currency: 'EGP' },
    ]);
    itineraries = app.get(ItinerariesService);
    bridge = app.get(ItineraryFlightsService);
    searches = app.get(FlightsService);
  });
  beforeEach(async () => {
    // Every destructive fixture operation is limited to the UUID-named local DB.
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
    for (const name of [
      'ItineraryDay',
      'Itinerary',
      'Flight',
      'Airport',
      'City',
      'Airline',
    ])
      await db.model(name).deleteMany({});
    await db
      .model('City')
      .create(
        cities.map((c) => ({
          cityId: c.city_id,
          name: c.name,
          countryCode: c.country_code,
        })),
      );
    const records = await db
      .model('Airport')
      .create(
        airports.map((a) => ({
          iataCode: a.iata_code,
          name: a.name,
          city: a.city_id,
          country: a.country_code,
          timezone: a.time_zone,
        })),
      );
    ports = new Map(
      records.map((a) => [a.iataCode, { _id: a._id, timezone: a.timezone }]),
    );
    airline = (
      await db
        .model('Airline')
        .create({ name: 'ITN26 Air', code: 'IT', isActive: true })
    )._id;
    counter = 0;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    try {
      if (
        db &&
        db.name === process.env.E2E_DATABASE_NAME &&
        /^travel_e2e_[a-f0-9]{32}$/.test(db.name)
      )
        await db.dropDatabase();
    } finally {
      if (app) await app.close();
      const dir = process.env.UPLOADS_DIR;
      if (
        dir &&
        path.dirname(dir) === tmpdir() &&
        path.basename(dir).startsWith('travel-uploads-e2e-')
      )
        await rm(dir, { recursive: true, force: true });
    }
  });
  async function seed(count = 3, city = 'london', start = '2040-02-28') {
    const parent = await db
      .model('Itinerary')
      .create({
        userId: owner,
        title: 'ITN26',
        countryIds: ['GB', 'EG'],
        startDate: date(start),
      });
    const days = count
      ? await db
          .model('ItineraryDay')
          .create(
            Array.from({ length: count }, (_, i) => ({
              itineraryId: parent._id,
              dayNumber: i + 1,
              cityId: city,
              notes: 'Keep',
            })),
          )
      : [];
    return { id: parent._id.toString(), days };
  }
  async function flight(
    from = 'CAI',
    to = 'LHR',
    day = '2040-02-28',
    fare = 100,
    hour = '10:00',
    duration = 120,
    change: Record<string, unknown> = {},
  ) {
    const departure = fromZonedTime(
      day + 'T' + hour + ':00',
      ports.get(from)!.timezone,
    );
    return db
      .model('Flight')
      .create({
        airline,
        flightNumber: 'IT' + ++counter,
        departureAirport: ports.get(from)!._id,
        arrivalAirport: ports.get(to)!._id,
        departureTime: departure,
        arrivalTime: new Date(departure.getTime() + duration * 60000),
        departureLocalDate: day,
        status: 'SCHEDULED',
        durationMinutes: duration,
        cabins: [
          {
            cabinClass: 'ECONOMY',
            totalSeats: 20,
            bookedSeats: 2,
            heldSeats: 3,
            price: fare,
            freeBags: 1,
            maxBagWeightKg: 20,
          },
        ],
        ...change,
      });
  }
  const get = (
    id: string,
    extra: Record<string, unknown> = {},
    cookies = auth,
  ) =>
    request(app.getHttpServer())
      .get('/api/itineraries/' + id + '/flights')
      .set('Cookie', cookies)
      .query({ departureAirport: 'CAI', adults: 1, ...extra });
  it('uses outbound default, preserves formatted flight/cabin response and accepts a single destination airport', async () => {
    const data = await seed(1, 'dubai');
    const f = await flight('CAI', 'DXB');
    const result = await get(data.id).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).not.toHaveProperty('return');
    expect(result.body.outbound).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    expect(result.body.outbound.items[0]).toMatchObject({
      _id: f._id.toString(),
      departureLocalTime: '2040-02-28T10:00:00',
      departureTimezone: 'Africa/Cairo',
      arrivalTimezone: 'Asia/Dubai',
      cabins: [{ seatsRemaining: 15, fare: 100, totalPrice: 100 }],
    });
  });
  it('globally filters, sorts and paginates THREE airports, with correct total counts and no per-airport pages', async () => {
    const data = await seed();
    const expected: { id: string; fare: number }[] = [];
    for (let index = 0; index < 15; index++) {
      const fare = 100 + ((index * 7) % 15);
      const f = await flight(
        'CAI',
        ['LHR', 'LGW', 'STN'][index % 3],
        '2040-02-28',
        fare,
      );
      expected.push({ id: f._id.toString(), fare });
    }
    await flight('CAI', 'JFK', '2040-02-28', 105);
    await flight('CAI', 'LHR', '2040-02-28', 999);
    const sorted = expected
      .filter((f) => f.fare >= 102 && f.fare <= 114)
      .sort((a, b) => b.fare - a.fare);
    const first = await get(data.id, {
      minPrice: 102,
      maxPrice: 114,
      sortBy: 'price',
      sortOrder: 'desc',
    }).expect(200);
    const second = await get(data.id, {
      minPrice: 102,
      maxPrice: 114,
      sortBy: 'price',
      sortOrder: 'desc',
      outboundPage: 2,
    }).expect(200);
    expect(first.body.outbound.total).toBe(13);
    expect(second.body.outbound.total).toBe(13);
    expect(first.body.outbound.items).toHaveLength(10);
    expect(second.body.outbound.items).toHaveLength(3);
    const items = [...first.body.outbound.items, ...second.body.outbound.items];
    expect(items.map((f: { _id: string }) => f._id)).toEqual(
      sorted.map((f) => f.id),
    );
    expect(new Set(items.map((f: { _id: string }) => f._id)).size).toBe(13);
    expect(
      new Set(
        items.map(
          (f: { arrivalAirport: { iataCode: string } }) =>
            f.arrivalAirport.iataCode,
        ),
      ),
    ).toEqual(new Set(['LHR', 'LGW', 'STN']));
    expect(
      (await get(data.id, { outboundPage: 999 }).expect(200)).body.outbound,
    ).toMatchObject({ items: [], total: 16, page: 999 });
  });
  it.each(['price', 'duration', 'departureTime'])(
    'sorts %s globally in both directions across all three airports',
    async (sortBy) => {
      const data = await seed();
      const ids = [];
      for (const [index, code] of ['LHR', 'LGW', 'STN'].entries())
        ids.push(
          (
            await flight(
              'CAI',
              code,
              '2040-02-28',
              100 + index,
              ['08:00', '09:00', '10:00'][index],
              60 + index * 30,
            )
          )._id.toString(),
        );
      for (const sortOrder of ['asc', 'desc']) {
        const response = await get(data.id, { sortBy, sortOrder }).expect(200);
        expect(
          response.body.outbound.items.map((f: { _id: string }) => f._id),
        ).toEqual(sortOrder === 'asc' ? ids : [...ids].reverse());
      }
    },
  );
  it('returns reverse flights from ALL eligible city airports to only the chosen origin with default last-day date', async () => {
    const data = await seed();
    for (const code of ['LHR', 'LGW', 'STN']) {
      await flight('CAI', code);
      await flight(code, 'CAI', '2040-03-01');
    }
    await flight('LHR', 'DXB', '2040-03-01');
    await flight('JFK', 'CAI', '2040-03-01');
    const result = await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(result.body.outbound.total).toBe(3);
    expect(result.body.return.total).toBe(3);
    expect(
      new Set(
        result.body.return.items.map(
          (f: { departureAirport: { iataCode: string } }) =>
            f.departureAirport.iataCode,
        ),
      ),
    ).toEqual(new Set(['LHR', 'LGW', 'STN']));
    expect(
      result.body.return.items.every(
        (f: {
          arrivalAirport: { iataCode: string };
          departureLocalDate: string;
        }) =>
          f.arrivalAirport.iataCode === 'CAI' &&
          f.departureLocalDate === '2040-03-01',
      ),
    ).toBe(true);
  });
  it('paginates return flights globally and independently of outbound pages', async () => {
    const data = await seed();
    for (let index = 0; index < 12; index++)
      await flight(
        ['LHR', 'LGW', 'STN'][index % 3],
        'CAI',
        '2040-03-01',
        100 + index,
      );
    const result = await get(data.id, {
      tripType: 'ROUND_TRIP',
      returnPage: 2,
      outboundPage: 3,
      sortBy: 'price',
    }).expect(200);
    expect(result.body.outbound).toMatchObject({
      items: [],
      page: 3,
      total: 0,
    });
    expect(result.body.return).toMatchObject({
      total: 12,
      page: 2,
      pageSize: 10,
      totalPages: 2,
    });
    expect(
      result.body.return.items.map(
        (f: { cabins: { fare: number }[] }) => f.cabins[0].fare,
      ),
    ).toEqual([110, 111]);
  });
  it('deduplicates correct flight IDs before totals/pagination without merging equal flight numbers', async () => {
    const data = await seed();
    const one = await flight();
    const otherAirline = await db
      .model('Airline')
      .create({ name: 'Second Airline', code: 'SA' });
    const two = await flight('CAI', 'LGW', '2040-02-28', 200, '10:00', 120, {
      airline: otherAirline._id,
      flightNumber: one.flightNumber,
    });
    const model = db.model('Flight'),
      original = model.find.bind(model);
    jest.spyOn(model, 'find').mockImplementationOnce((...args) => {
      const q = original(...args),
        exec = q.exec.bind(q);
      jest.spyOn(q, 'exec').mockImplementationOnce(async () => {
        const rows = await exec();
        return [
          ...rows,
          { ...rows[0], _id: new Types.ObjectId(rows[0]._id.toString()) },
        ];
      });
      return q;
    });
    const result = await get(data.id, { sortBy: 'price' }).expect(200);
    expect(result.body.outbound.total).toBe(2);
    expect(
      result.body.outbound.items.map((f: { _id: string }) => f._id),
    ).toEqual([one._id.toString(), two._id.toString()]);
  });
  it('preserves legacy unpaginated arrays and identical availability, pricing and formatting', async () => {
    const data = await seed();
    for (let index = 0; index < 12; index++)
      await flight('CAI', 'LHR', '2040-02-28', 10 + index);
    const params = {
      departureAirport: 'CAI',
      arrivalAirport: 'LHR',
      departureDate: '2040-02-28',
      adults: 2,
      children: 1,
      infants: 1,
      cabinClass: 'ECONOMY',
      sortBy: 'price',
    };
    const legacy = await request(app.getHttpServer())
      .get('/api/flights/search')
      .query(params)
      .expect(200);
    expect(Array.isArray(legacy.body.outbound)).toBe(true);
    expect(legacy.body.outbound).toHaveLength(12);
    expect(legacy.body).not.toHaveProperty('total');
    const page1 = await get(data.id, {
        adults: 2,
        children: 1,
        infants: 1,
        cabinClass: 'ECONOMY',
        sortBy: 'price',
      }).expect(200),
      page2 = await get(data.id, {
        adults: 2,
        children: 1,
        infants: 1,
        cabinClass: 'ECONOMY',
        sortBy: 'price',
        outboundPage: 2,
      }).expect(200);
    expect([
      ...page1.body.outbound.items,
      ...page2.body.outbound.items,
    ]).toEqual(legacy.body.outbound);
    expect(page1.body.outbound.items[0].cabins[0]).toMatchObject({
      fare: 10,
      totalPrice: 31,
      seatsRemaining: 15,
    });
    for (const invalid of [
      { adults: 0 },
      { infants: 3 },
      { minPrice: 200, maxPrice: 100 },
    ])
      await request(app.getHttpServer())
        .get('/api/flights/search')
        .query({ ...params, ...invalid })
        .expect(400);
  });
  it.each([
    'held',
    'booked',
    'cancelled',
    'departed',
    'inactive',
    'cabin',
    'price',
    'past',
  ])('preserves FLT-11/12 %s exclusions', async (kind) => {
    const data = await seed();
    const f = await flight();
    if (kind === 'held')
      await db
        .model('Flight')
        .updateOne({ _id: f._id }, { $set: { 'cabins.0.heldSeats': 19 } });
    if (kind === 'booked')
      await db
        .model('Flight')
        .updateOne({ _id: f._id }, { $set: { 'cabins.0.bookedSeats': 19 } });
    if (kind === 'cancelled' || kind === 'departed')
      await db
        .model('Flight')
        .updateOne({ _id: f._id }, { $set: { status: kind.toUpperCase() } });
    if (kind === 'inactive')
      await db
        .model('Airline')
        .updateOne({ _id: airline }, { $set: { isActive: false } });
    if (kind === 'past')
      await db
        .model('Flight')
        .updateOne(
          { _id: f._id },
          { $set: { departureTime: date('2000-01-01') } },
        );
    const result = await get(
      data.id,
      kind === 'cabin'
        ? { cabinClass: 'BUSINESS' }
        : kind === 'price'
          ? { minPrice: 101 }
          : {},
    ).expect(200);
    expect(result.body.outbound).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
  });
  it('supports explicit calendar overrides and a one-day round trip', async () => {
    const data = await seed(1);
    await flight();
    await flight('LHR', 'CAI');
    let result = await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(result.body.return.total).toBe(1);
    await flight('CAI', 'LHR', '2041-01-01');
    await flight('LHR', 'CAI', '2041-01-02');
    result = await get(data.id, {
      tripType: 'ROUND_TRIP',
      departureDate: '2041-01-01',
      returnDate: '2041-01-02',
    }).expect(200);
    expect(result.body.outbound.items[0].departureLocalDate).toBe('2041-01-01');
    expect(result.body.return.items[0].departureLocalDate).toBe('2041-01-02');
  });
  it.each([
    ['2040-12-31', '2041-01-02'],
    ['2040-02-28', '2040-03-01'],
    ['2040-04-30', '2040-05-02'],
  ])('defaults dates over calendar boundary %s', async (start, end) => {
    const data = await seed(3, 'london', start);
    await flight('CAI', 'LHR', start);
    await flight('LHR', 'CAI', end);
    const result = await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(result.body.outbound.total).toBe(1);
    expect(result.body.return.total).toBe(1);
  });
  it.each([
    ['JFK', '23:30', '2040-01-02'],
    ['HND', '00:30', '2039-12-31'],
  ])(
    'matches %s local calendar date across UTC boundaries',
    async (origin, hour, utcDay) => {
      const data = await seed(1, 'london', '2040-01-01');
      const f = await flight(origin, 'LHR', '2040-01-01', 100, hour);
      expect(f.departureTime.toISOString().slice(0, 10)).toBe(utcDay);
      const result = await get(data.id, { departureAirport: origin }).expect(
        200,
      );
      expect(result.body.outbound.total).toBe(1);
      expect(result.body.outbound.items[0].departureLocalDate).toBe(
        '2040-01-01',
      );
    },
  );
  it('handles origin inside the destination city, excluding only the identical airport', async () => {
    const data = await seed(1);
    await flight('LHR', 'LGW');
    await flight('LHR', 'STN');
    await flight('LGW', 'LHR');
    const result = await get(data.id, {
      departureAirport: 'LHR',
      tripType: 'ROUND_TRIP',
    }).expect(200);
    expect(result.body.outbound.total).toBe(2);
    expect(result.body.return.total).toBe(1);
    expect(
      result.body.outbound.items.every(
        (f: { arrivalAirport: { iataCode: string } }) =>
          f.arrivalAirport.iataCode !== 'LHR',
      ),
    ).toBe(true);
    const only = await seed(1, 'cairo');
    expect((await get(only.id).expect(200)).body.outbound.total).toBe(0);
  });
  it('returns empty pages for no city airports or no matching flights', async () => {
    const data = await seed();
    expect(
      (await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200)).body.return
        .total,
    ).toBe(0);
    await db.model('Airport').deleteMany({ city: 'london' });
    const result = await get(data.id).expect(200);
    expect(result.body.outbound).toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
    });
  });
  it.each([
    { tripType: 'BAD' },
    { adults: 0 },
    { adults: 10 },
    { adults: 1.5 },
    { children: -1 },
    { infants: 2 },
    { cabinClass: 'BAD' },
    { minPrice: -1 },
    { minPrice: 200, maxPrice: 100 },
    { sortBy: 'BAD' },
    { sortOrder: 'up' },
    { departureDate: '2040-02-30' },
    { departureDate: '2040/01/01' },
    { returnDate: '2040-03-01' },
    { returnPage: 1 },
    { outboundPage: 0 },
    { outboundPage: 1.5 },
    { tripType: 'ROUND_TRIP', returnPage: -1 },
    { tripType: 'ROUND_TRIP', returnDate: '2040-02-27' },
    { arrivalAirport: 'JFK' },
    { city: 'paris' },
    { departureAirport: 'XXX' },
  ])('rejects invalid query %j', async (query) => {
    const data = await seed();
    await get(data.id, query).expect(400);
  });
  it('enforces auth and ownership for Private and Public itineraries', async () => {
    const data = await seed();
    const spy = jest.spyOn(searches, 'searchToAirports');
    await get(data.id, {}, []).expect(401);
    await get(data.id, {}, other).expect(404);
    await db
      .model('Itinerary')
      .updateOne({ _id: data.id }, { $set: { visibility: 'PUBLIC' } });
    await get(data.id, {}, other).expect(404);
    expect(spy).not.toHaveBeenCalled();
  });
  it('rejects missing/deleted days, bad IDs, unsupported airports and stale canonical mappings', async () => {
    const data = await seed();
    await get('bad').expect(400);
    await get(new Types.ObjectId().toString()).expect(404);
    await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/flights')
      .set('Cookie', auth)
      .query({ adults: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/flights')
      .set('Cookie', auth)
      .query({ departureAirport: 'CAI' })
      .expect(400);
    const empty = await seed(0);
    await get(empty.id).expect(404);
    await db
      .model('Airport')
      .create({
        iataCode: 'ZZZ',
        name: 'Unseeded',
        city: 'london',
        country: 'GB',
        timezone: 'Europe/London',
      });
    await get(data.id, { departureAirport: 'ZZZ' }).expect(400);
    await db
      .model('Airport')
      .updateOne({ iataCode: 'LHR' }, { $set: { city: 'paris' } });
    await get(data.id).expect(409);
    await db
      .model('Airport')
      .updateOne({ iataCode: 'LHR' }, { $set: { city: 'london' } });
    await db.model('Airport').deleteOne({ iataCode: 'CAI' });
    await get(data.id).expect(400);
    await db.model('ItineraryDay').deleteOne({ _id: data.days[0]._id });
    await get(data.id).expect(409);
  });
  it('recalculates destination and last date after day reorder, edits and deletion', async () => {
    const data = await seed();
    await itineraries.updateDay(owner, data.id, data.days[2]._id.toString(), {
      cityId: 'dubai',
    });
    await itineraries.reorderDay(owner, data.id, data.days[2]._id.toString(), {
      newPosition: 1,
    });
    const spy = jest.spyOn(searches, 'searchToAirports');
    await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(spy.mock.calls[0][1]).toEqual(['DXB']);
    await itineraries.removeDay(owner, data.id, data.days[1]._id.toString());
    await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(spy.mock.calls[1][0]).toMatchObject({ returnDate: '2040-02-29' });
    await itineraries.update(owner, data.id, { startDate: '2040-12-31' });
    await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(spy.mock.calls[2][0]).toMatchObject({
      departureDate: '2040-12-31',
      returnDate: '2041-01-01',
    });
  });
  it('uses one coherent snapshot across concurrent itinerary edits', async () => {
    const data = await seed();
    const model = db.model('Itinerary'),
      original = model.findOne.bind(model);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => (entered = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    jest.spyOn(model, 'findOne').mockImplementationOnce((...args) => {
      const q = original(...args),
        exec = q.exec.bind(q);
      jest.spyOn(q, 'exec').mockImplementationOnce(async () => {
        const result = await exec();
        entered();
        await gate;
        return result;
      });
      return q;
    });
    const spy = jest.spyOn(searches, 'searchToAirports'),
      pending = bridge.search(owner, data.id, {
        departureAirport: 'CAI',
        adults: 1,
      });
    await ready;
    try {
      await itineraries.updateDay(owner, data.id, data.days[0]._id.toString(), {
        cityId: 'dubai',
      });
    } finally {
      release();
    }
    await pending;
    expect(spy.mock.calls[0][1]).toEqual(['LGW', 'LHR', 'STN']);
    await get(data.id).expect(200);
    expect(spy.mock.calls[1][1]).toEqual(['DXB']);
  });
  it('keeps query count independent of airport count and ends the itinerary snapshot before availability reads', async () => {
    const data = await seed();
    for (const code of ['LHR', 'LGW', 'STN']) {
      await flight('CAI', code);
      await flight(code, 'CAI', '2040-03-01');
    }
    const commands: {
      find?: string;
      readConcern?: { level?: string; atClusterTime?: unknown };
      lsid?: unknown;
      startTransaction?: unknown;
    }[] = [];
    const listener = (event: {
      databaseName: string;
      commandName: string;
      command: (typeof commands)[number];
    }) => {
      if (event.databaseName === db.name && event.commandName === 'find')
        commands.push(event.command);
    };
    const start = db.startSession.bind(db),
      sessions: Awaited<ReturnType<typeof start>>[] = [];
    jest.spyOn(db, 'startSession').mockImplementation(async (options) => {
      const session = await start(options);
      sessions.push(session);
      return session;
    });
    db.getClient().on('commandStarted', listener);
    try {
      await bridge.search(owner, data.id, {
        departureAirport: 'CAI',
        adults: 1,
        tripType: ItineraryTripType.ROUND_TRIP,
      });
    } finally {
      db.getClient().off('commandStarted', listener);
    }
    expect(sessions).toHaveLength(1);
    expect(sessions[0].hasEnded).toBe(true);
    expect(
      commands.filter((command) => command.find === 'flights'),
    ).toHaveLength(2);
    const snapshot = commands.filter(
      (command) => command.readConcern?.level === 'snapshot',
    );
    expect(snapshot).toHaveLength(4);
    for (const command of snapshot) {
      expect(command.lsid).toEqual(snapshot[0].lsid);
      expect(command.startTransaction).toBeUndefined();
    }
    for (const command of snapshot.slice(1))
      expect(command.readConcern?.atClusterTime).toEqual(
        snapshot[1].readConcern?.atClusterTime,
      );
    expect(
      commands
        .filter((command) => command.find === 'flights')
        .every((command) => command.readConcern?.level !== 'snapshot'),
    ).toBe(true);
  });
  it('does not mutate itineraries, inventory, bookings or holds', async () => {
    const data = await seed();
    await flight();
    const snapshot = async () => {
      const rows = [];
      for (const name of [
        'Itinerary',
        'ItineraryDay',
        'Flight',
        'Airport',
        'Airline',
        'Activity',
        'BudgetEntry',
        'TransportCost',
      ])
        rows.push(await db.model(name).find().sort({ _id: 1 }).lean());
      rows.push(await db.collection('flightbookings').find().toArray());
      return JSON.stringify(rows);
    };
    const before = await snapshot();
    await get(data.id, { tripType: 'ROUND_TRIP' }).expect(200);
    expect(await snapshot()).toBe(before);
  });
  it('documents exact PDF route, passenger/filter/page parameters and paginated leg schema', () => {
    const document = SwaggerModule.createDocument(app, createSwaggerConfig()),
      operation = document.paths['/api/itineraries/{id}/flights'].get!;
    expect(operation.security).toContainEqual({ access_token: [] });
    for (const status of ['200', '400', '401', '403', '404', '409', '503'])
      expect(operation.responses).toHaveProperty(status);
    const names = operation.parameters!.map((item) =>
      'name' in item ? item.name : '',
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'departureAirport',
        'tripType',
        'departureDate',
        'returnDate',
        'adults',
        'children',
        'infants',
        'cabinClass',
        'minPrice',
        'maxPrice',
        'sortBy',
        'sortOrder',
        'outboundPage',
        'returnPage',
      ]),
    );
    expect(names).not.toContain('arrivalAirport');
    expect(operation.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ItineraryFlightSearchResponseDto',
          },
        },
      },
    });
    expect(document.paths['/api/flights/search'].get!.security ?? []).toEqual(
      [],
    );
  });
});
