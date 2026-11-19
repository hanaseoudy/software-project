import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { SwaggerModule } from '@nestjs/swagger';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { ItinerariesModule } from '../src/itineraries/itineraries.module';
import { ItinerariesService } from '../src/itineraries/itineraries.service';
import { ItineraryHotelsService } from '../src/itineraries/itinerary-hotels.service';
import { HotelSearchService } from '../src/hotels/hotel-search.service';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { createSwaggerConfig } from '../src/common/swagger.config';

// setup-e2e.ts requires a localhost-only URI and creates a unique disposable DB.
describe('ITN-25 hotel search against isolated local MongoDB', () => {
  let app: INestApplication,
    db: Connection,
    owner: string,
    auth: string[],
    other: string[];
  let itineraries: ItinerariesService,
    searches: HotelSearchService,
    bridge: ItineraryHotelsService;
  let country: Types.ObjectId;
  const date = (value: string) => new Date(value + 'T00:00:00Z');
  const login = async (email: string) => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'ITN25',
        lastName: 'Tester',
        email,
        password: 'TestPassword123',
        acceptTerms: true,
      })
      .expect(201);
    const result = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'TestPassword123' })
      .expect(200);
    return (result.headers['set-cookie'] as unknown as string[]).map(
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
    country = (
      await db
        .model('Country')
        .create({ code: 'EG', name: 'Egypt', currency: 'EGP' })
    )._id;
    auth = await login('itn25-owner@example.com');
    other = await login('itn25-other@example.com');
    owner = (await db
      .model('User')
      .findOne({ email: 'itn25-owner@example.com' }))!._id.toString();
    itineraries = app.get(ItinerariesService);
    searches = app.get(HotelSearchService);
    bridge = app.get(ItineraryHotelsService);
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
      const directory = process.env.UPLOADS_DIR;
      if (
        directory &&
        path.dirname(directory) === tmpdir() &&
        path.basename(directory).startsWith('travel-uploads-e2e-')
      )
        await rm(directory, { recursive: true, force: true });
    }
  });
  async function seed(
    codes = ['CAI', 'CAI', 'GIZ', 'CAI'],
    start = '2040-02-28',
  ) {
    const suffix = new Types.ObjectId().toString(),
      cities = new Map<string, { _id: Types.ObjectId; cityId: string }>();
    for (const code of new Set(codes)) {
      const city = await db
        .model('City')
        .create({ cityId: code + '-' + suffix, name: code, countryCode: 'EG' });
      cities.set(code, { _id: city._id, cityId: city.cityId });
    }
    const parent = await db
      .model('Itinerary')
      .create({
        userId: owner,
        title: 'ITN-25',
        countryIds: ['EG'],
        startDate: date(start),
      });
    const days = codes.length
      ? await db
          .model('ItineraryDay')
          .create(
            codes.map((code, i) => ({
              itineraryId: parent._id,
              dayNumber: i + 1,
              cityId: cities.get(code)!.cityId,
              notes: 'Preserve me',
            })),
          )
      : [];
    return { id: parent._id.toString(), days, cities };
  }
  async function hotel(
    city: Types.ObjectId,
    name = 'Nile Palace',
    price = 100,
    rating = 4.5,
  ) {
    const record = await db
      .model('Hotel')
      .create({
        city,
        country,
        name,
        address: '1 Corniche',
        starRating: 5,
        averageRating: rating,
        reviewCount: 2,
      });
    const rooms = await db
      .model('Room')
      .create(
        [1, 2].map((number) => ({
          hotel: record._id,
          roomNumber: String(number),
          type: 'Double',
          beds: 2,
          maxOccupancy: 2,
          pricePerNight: price + number - 1,
        })),
      );
    await db
      .model('RoomAvailability')
      .create(
        rooms.map((room) => ({
          room: room._id,
          hotel: record._id,
          type: 'available',
          startDate: date('2039-01-01'),
          endDate: date('2042-12-31'),
        })),
      );
    return { record, rooms };
  }
  const get = (
    id: string,
    dayId: string,
    extra: Record<string, unknown> = {},
    cookies = auth,
  ) =>
    request(app.getHttpServer())
      .get('/api/itineraries/' + id + '/hotels')
      .set('Cookie', cookies)
      .query({ groupFirstDayId: dayId, guests: 3, rooms: 2, ...extra });
  async function snapshot() {
    const values: unknown[] = [];
    for (const name of [
      'Itinerary',
      'ItineraryDay',
      'Activity',
      'BudgetEntry',
      'TransportCost',
      'Hotel',
      'Room',
      'RoomAvailability',
      'HotelBooking',
    ])
      values.push(await db.model(name).find().sort({ _id: 1 }).lean());
    return JSON.stringify(values);
  }
  it('searches the selected ITN-09 group using canonical city ObjectId and the unchanged HTL-11 page', async () => {
    const data = await seed();
    const expected = await hotel(data.cities.get('CAI')!._id);
    const groups = await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/groups')
      .set('Cookie', auth)
      .expect(200);
    const first = groups.body.groups[0].firstDay.id;
    expect(first).toBe(data.days[0]._id.toString());
    const spy = jest.spyOn(searches, 'search');
    const result = await get(data.id, first).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        city: data.cities.get('CAI')!._id.toString(),
        checkIn: '2040-02-28',
        checkOut: '2040-03-01',
        guests: 3,
        rooms: 2,
        page: 1,
      }),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.body).toEqual({
      items: [
        {
          id: expected.record._id.toString(),
          name: 'Nile Palace',
          address: '1 Corniche',
          city: data.cities.get('CAI')!._id.toString(),
          country: country.toString(),
          starRating: 5,
          image: null,
          averageRating: 4.5,
          reviewCount: 2,
          availableRooms: 2,
          lowestPricePerNight: 100,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    const direct = await request(app.getHttpServer())
      .get('/api/hotels/search')
      .query({
        city: data.cities.get('CAI')!._id.toString(),
        checkIn: '2040-02-28',
        checkOut: '2040-03-01',
        guests: 3,
        rooms: 2,
      })
      .expect(200);
    expect(result.body).toEqual(direct.body);
  });
  it('keeps repeated nonconsecutive visits separate and derives one-day checkout', async () => {
    const data = await seed();
    await hotel(data.cities.get('CAI')!._id);
    const spy = jest.spyOn(searches, 'search');
    await get(data.id, data.days[3]._id.toString()).expect(200);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIn: '2040-03-02',
        checkOut: '2040-03-03',
      }),
    );
    await get(data.id, data.days[1]._id.toString()).expect(404);
  });
  it.each([
    ['2040-12-31', '2041-01-01'],
    ['2040-04-30', '2040-05-01'],
    ['2040-02-29', '2040-03-01'],
  ])('derives calendar checkout after %s', async (start, end) => {
    const data = await seed(['CAI'], start);
    const spy = jest.spyOn(searches, 'search');
    await get(data.id, data.days[0]._id.toString()).expect(200);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ checkIn: start, checkOut: end }),
    );
  });
  it('defaults rooms to one and delegates all filters with pagination', async () => {
    const data = await seed(['CAI']);
    const city = data.cities.get('CAI')!._id;
    for (let index = 0; index < 11; index++)
      await hotel(
        city,
        'Hotel ' + String(index).padStart(2, '0'),
        100 + index,
        4.5,
      );
    await hotel(city, 'Cheap excluded', 1, 2);
    const query = {
      groupFirstDayId: data.days[0]._id.toString(),
      guests: 2,
      minPrice: 100,
      maxPrice: 110,
      minRating: 4,
      sortBy: 'price',
      sortOrder: 'desc',
      page: 2,
    };
    const result = await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/hotels')
      .set('Cookie', auth)
      .query(query)
      .expect(200);
    expect(result.body).toMatchObject({
      total: 11,
      page: 2,
      pageSize: 10,
      totalPages: 2,
    });
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].lowestPricePerNight).toBe(100);
    const direct = await request(app.getHttpServer())
      .get('/api/hotels/search')
      .query({
        ...query,
        city: city.toString(),
        checkIn: '2040-02-28',
        checkOut: '2040-02-29',
      })
      .expect(200);
    expect(result.body).toEqual(direct.body);
  });
  it.each([
    { guests: 0 },
    { guests: -1 },
    { guests: 1.5 },
    { guests: 'bad' },
    { rooms: 0 },
    { rooms: -1 },
    { rooms: 1.5 },
    { page: 0 },
    { minRating: 6 },
    { minPrice: -1 },
    { sortBy: 'bad' },
    { minPrice: 100, maxPrice: 10 },
  ])('rejects invalid occupancy/filter %j', async (query) => {
    const data = await seed(['CAI']);
    await get(data.id, data.days[0]._id.toString(), query).expect(400);
  });
  it.each(['city', 'country', 'checkIn', 'checkOut', 'groupIndex', 'dayIds'])(
    'rejects client %s overrides',
    async (field) => {
      const data = await seed(['CAI']);
      const spy = jest.spyOn(searches, 'search');
      await get(data.id, data.days[0]._id.toString(), {
        [field]: 'override',
      }).expect(400);
      expect(spy).not.toHaveBeenCalled();
    },
  );
  it('rejects missing/invalid IDs and required parameters, empty itineraries and wrong associations', async () => {
    const data = await seed(['CAI']),
      another = await seed(['CAI']),
      empty = await seed([]);
    await get('bad', data.days[0]._id.toString()).expect(400);
    await get(data.id, 'bad').expect(400);
    await get(
      new Types.ObjectId().toString(),
      data.days[0]._id.toString(),
    ).expect(404);
    await get(data.id, another.days[0]._id.toString()).expect(404);
    await get(data.id, new Types.ObjectId().toString()).expect(404);
    await get(empty.id, data.days[0]._id.toString()).expect(404);
    await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/hotels')
      .set('Cookie', auth)
      .query({ guests: 2 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/hotels')
      .set('Cookie', auth)
      .query({ groupFirstDayId: data.days[0]._id.toString() })
      .expect(400);
  });
  it('requires authentication and ownership even for a Public itinerary', async () => {
    const data = await seed(['CAI']),
      spy = jest.spyOn(searches, 'search');
    await get(data.id, data.days[0]._id.toString(), {}, []).expect(401);
    await get(data.id, data.days[0]._id.toString(), {}, other).expect(404);
    await db
      .model('Itinerary')
      .updateOne({ _id: data.id }, { $set: { visibility: 'PUBLIC' } });
    await get(data.id, data.days[0]._id.toString(), {}, other).expect(404);
    expect(spy).not.toHaveBeenCalled();
  });
  it('rejects past derived check-in through HTL-11', async () => {
    const data = await seed(['CAI'], '2000-01-01');
    const result = await get(data.id, data.days[0]._id.toString()).expect(400);
    expect(result.body.errors).toHaveProperty('checkIn');
  });
  it.each([
    'no-hotels',
    'blocked',
    'booked',
    'hold',
    'gap',
    'capacity',
    'rooms',
    'inactive',
  ])('preserves HTL-11 %s exclusions', async (kind) => {
    const data = await seed(['CAI']);
    if (kind !== 'no-hotels') {
      const h = await hotel(data.cities.get('CAI')!._id);
      if (kind === 'blocked')
        await db
          .model('RoomAvailability')
          .create(
            h.rooms.map((room) => ({
              room: room._id,
              hotel: h.record._id,
              type: 'blocked',
              startDate: date('2040-02-28'),
              endDate: date('2040-02-28'),
            })),
          );
      if (kind === 'gap')
        await db.model('RoomAvailability').deleteMany({ hotel: h.record._id });
      if (kind === 'capacity')
        await db
          .model('Room')
          .updateMany({ hotel: h.record._id }, { $set: { maxOccupancy: 1 } });
      if (kind === 'rooms')
        await db
          .model('Room')
          .updateOne({ _id: h.rooms[0]._id }, { $set: { isActive: false } });
      if (kind === 'inactive')
        await db
          .model('Hotel')
          .updateOne({ _id: h.record._id }, { $set: { isActive: false } });
      if (kind === 'booked' || kind === 'hold')
        await db
          .model('HotelBooking')
          .create({
            user: owner,
            hotel: h.record._id,
            rooms: h.rooms.map((room) => ({
              room: room._id,
              pricePerNight: 100,
              adults: 1,
              children: 0,
            })),
            checkIn: date('2040-02-28'),
            checkOut: date('2040-02-29'),
            totalPrice: 200,
            status: kind === 'booked' ? 'CONFIRMED' : 'PENDING_PAYMENT',
            holdExpiresAt: new Date(Date.now() + 60000),
          });
    }
    const result = await get(data.id, data.days[0]._id.toString()).expect(200);
    expect(result.body).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
  });
  it('recalculates after reorder, city edits and start-date edits; stale boundaries return 404', async () => {
    const data = await seed(['CAI', 'CAI', 'GIZ']),
      first = data.days[0]._id.toString(),
      second = data.days[1]._id.toString();
    const spy = jest.spyOn(searches, 'search');
    await itineraries.reorderDay(owner, data.id, second, { newPosition: 1 });
    await get(data.id, first).expect(404);
    await get(data.id, second).expect(200);
    await itineraries.updateDay(owner, data.id, data.days[2]._id.toString(), {
      cityId: data.cities.get('CAI')!.cityId,
    });
    await get(data.id, second).expect(200);
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({
      checkIn: '2040-02-28',
      checkOut: '2040-03-02',
    });
    await itineraries.update(owner, data.id, { startDate: '2040-12-31' });
    await get(data.id, second).expect(200);
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({
      checkIn: '2040-12-31',
      checkOut: '2041-01-03',
    });
  });
  it('does not mutate itinerary, expense, hotel, inventory or booking documents', async () => {
    const data = await seed();
    await hotel(data.cities.get('CAI')!._id);
    const before = await snapshot();
    await get(data.id, data.days[0]._id.toString()).expect(200);
    expect(await snapshot()).toBe(before);
  });
  it('uses a coherent group snapshot when an edit commits between reads', async () => {
    const data = await seed(['CAI', 'CAI', 'GIZ']);
    const parent = db.model('Itinerary'),
      original = parent.findOne.bind(parent);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    jest.spyOn(parent, 'findOne').mockImplementationOnce((...args) => {
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
    const spy = jest.spyOn(searches, 'search'),
      pending = bridge.search(owner, data.id, {
        groupFirstDayId: data.days[0]._id.toString(),
        guests: 1,
        rooms: 1,
      });
    await ready;
    try {
      await itineraries.updateDay(owner, data.id, data.days[2]._id.toString(), {
        cityId: data.cities.get('CAI')!.cityId,
      });
    } finally {
      release();
    }
    await pending;
    expect(spy.mock.calls[0][0]).toMatchObject({ checkOut: '2040-03-01' });
    await get(data.id, data.days[0]._id.toString()).expect(200);
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ checkOut: '2040-03-02' });
  });
  it('uses one wire-level snapshot for group/city reads and closes it before hotel queries', async () => {
    const data = await seed(['CAI']);
    const commands: {
      find?: string;
      lsid?: unknown;
      readConcern?: { level?: string; atClusterTime?: unknown };
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
    const spy = jest
      .spyOn(searches, 'search')
      .mockImplementation(async (query) => {
        expect(sessions[0].hasEnded).toBe(true);
        return {
          items: [],
          total: 0,
          page: query.page ?? 1,
          pageSize: 10,
          totalPages: 0,
        };
      });
    db.getClient().on('commandStarted', listener);
    try {
      await bridge.search(owner, data.id, {
        groupFirstDayId: data.days[0]._id.toString(),
        guests: 1,
      });
    } finally {
      db.getClient().off('commandStarted', listener);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(3);
    expect(sessions).toHaveLength(1);
    for (const command of commands) {
      expect(command.readConcern?.level).toBe('snapshot');
      expect(command.lsid).toEqual(commands[0].lsid);
      expect(command.startTransaction).toBeUndefined();
    }
    expect(commands[1].readConcern?.atClusterTime).toBeDefined();
    expect(commands[2].readConcern?.atClusterTime).toEqual(
      commands[1].readConcern?.atClusterTime,
    );
  });
  it('rejects invalid persisted numbering and missing canonical city references', async () => {
    const data = await seed(['CAI']);
    const dayId = data.days[0]._id.toString();
    await db
      .model('ItineraryDay')
      .updateOne({ _id: dayId }, { $set: { dayNumber: 2 } });
    await get(data.id, dayId).expect(409);
    await db
      .model('ItineraryDay')
      .updateOne({ _id: dayId }, { $set: { dayNumber: 1 } });
    await db.model('City').deleteOne({ _id: data.cities.get('CAI')!._id });
    await get(data.id, dayId).expect(409);
  });
  it('documents the PDF path, inherited HTL-12 query parameters, auth and existing response', () => {
    const swagger = SwaggerModule.createDocument(app, createSwaggerConfig());
    const operation = swagger.paths['/api/itineraries/{id}/hotels'].get!;
    expect(operation.security).toContainEqual({ access_token: [] });
    for (const code of ['200', '400', '401', '403', '404', '409', '503'])
      expect(operation.responses).toHaveProperty(code);
    const names = operation.parameters!.map((item) =>
      'name' in item ? item.name : '',
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'groupFirstDayId',
        'guests',
        'rooms',
        'page',
        'minPrice',
        'maxPrice',
        'minRating',
        'sortBy',
        'sortOrder',
      ]),
    );
    expect(names).not.toContain('city');
    expect(names).not.toContain('checkIn');
    expect(operation.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/HotelSearchPageDto' },
        },
      },
    });
  });
});
