import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { createSwaggerConfig } from '../src/common/swagger.config';
import { ItinerariesModule } from '../src/itineraries/itineraries.module';
import type { ExchangeRateSnapshot } from '../src/itineraries/schemas/exchange-rate-snapshot.schema';
import { UsersModule } from '../src/users/users.module';

// setup-e2e.ts requires an explicitly selected localhost database.
describe('ITN-18 against an isolated MongoDB replica set', () => {
  const cacheId = 'fxratesapi:USD';
  const supported = ['AED', 'EGP', 'EUR', 'GBP', 'JPY', 'SAR', 'USD'];
  const providerDate = '2024-02-29T00:00:00.000Z';
  let app: INestApplication;
  let peer: INestApplication;
  let db: Connection;
  let peerDb: Connection;
  let call: jest.SpiedFunction<typeof fetch>;
  let owner: string[];
  let visitor: string[];
  let ownerId: Types.ObjectId;
  let itineraryId: Types.ObjectId;
  let dayId: Types.ObjectId;
  const route = () => '/api/itineraries/' + itineraryId + '/budget-summary';
  const converted = (target: INestApplication = app) =>
    request(target.getHttpServer())
      .get(route() + '?convert=preferred')
      .set('Cookie', owner);
  const cache = () => db.collection<ExchangeRateSnapshot>('exchange_rate_snapshots');
  const rateResponse = () =>
    Response.json({
      success: true,
      base: 'USD',
      date: providerDate,
      timestamp: Date.parse(providerDate) / 1000,
      rates: {
        USD: 1,
        EGP: 2,
        EUR: 0.5,
        AED: 4,
        GBP: 0.75,
        JPY: 150,
        SAR: 3.75,
      },
    });

  const createApp = async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(process.env.MONGODB_URI!),
        ItinerariesModule,
        UsersModule,
      ],
    }).compile();
    const target = module.createNestApplication();
    target.use(cookieParser());
    target.setGlobalPrefix('api');
    target.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    const config = target.get(ConfigService);
    config.set('FX_RATES_API_URL', 'https://fx.example.test/latest');
    config.set('FX_RATES_API_KEY', 'fixture');
    await target.init();
    const connection = target.get<Connection>(getConnectionToken());
    expect(connection.name).toBe(process.env.E2E_DATABASE_NAME);
    expect(
      (await connection.db!.admin().command({ hello: 1 })).setName,
    ).toBeTruthy();
    for (const model of Object.values(connection.models)) await model.init();
    return { target, connection };
  };

  const signIn = async (email: string) => {
    const password = 'TestPassword123';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email,
        password,
        acceptTerms: true,
      })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return (response.headers['set-cookie'] as unknown as string[]).map(
      (cookie) => cookie.split(';')[0],
    );
  };

  beforeAll(async () => {
    ({ target: app, connection: db } = await createApp());
    ({ target: peer, connection: peerDb } = await createApp());
    await db
      .collection('currencies')
      .insertMany(supported.map((code) => ({ code })));
    await db
      .model('City')
      .create({ cityId: 'CAI', name: 'Cairo', countryCode: 'EG' });
    owner = await signIn('budget-owner@example.com');
    visitor = await signIn('budget-visitor@example.com');
    ownerId = (
      await db
        .model('User')
        .findOne({ email: 'budget-owner@example.com' })
        .orFail()
    )._id;
  });

  beforeEach(async () => {
    call = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => rateResponse());
    await cache().deleteMany({});
    await db
      .model('User')
      .updateOne({ _id: ownerId }, { $unset: { preferences: 1 } });
    itineraryId = (
      await db.model('Itinerary').create({
        userId: ownerId,
        title: 'Leap trip',
        countryIds: ['EG'],
        startDate: new Date('2024-02-29T00:00:00Z'),
        visibility: 'PUBLIC',
      })
    )._id;
    const dayModel = db.model('ItineraryDay');
    dayId = (
      await dayModel.create({ itineraryId, dayNumber: 1, cityId: 'CAI' })
    )._id;
    await dayModel.create({ itineraryId, dayNumber: 2, cityId: 'CAI' });
    await db.model('BudgetEntry').create([
      { dayId, category: 'FOOD', amount: 10.01, currency: 'USD' },
      { dayId, category: 'FOOD', amount: 0.5, currency: 'EGP' },
    ]);
    await db.model('Activity').create({
      dayId,
      name: 'Museum',
      description: 'Visit',
      cost: 1.25,
      currency: 'EUR',
    });
    await db.model('TransportCost').create({
      dayId,
      mode: 'TRAIN',
      fromCityId: 'CAI',
      toCityId: 'GIZ',
      amount: 3,
      currency: 'EGP',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    try {
      if (app && db?.name === process.env.E2E_DATABASE_NAME)
        await db.dropDatabase();
    } finally {
      await peer?.close();
      await app?.close();
    }
  });

  it('preserves native responses and ITN-09 grouping, reads the ACC-09 default and next preference, and leaves booking/payment records intact', async () => {
    const protectedCollections = [
      'flightbookings',
      'hotelbookings',
      'payments',
      'refunds',
      'roomlocks',
    ];
    const fixtures = await Promise.all(
      protectedCollections.map(async (name) => {
        const collection = db.collection(name);
        const record = {
          _id: new Types.ObjectId(),
          userId: ownerId,
          currency: 'USD',
          amount: 137,
          totalPrice: 137,
          holdExpiresAt: new Date('2026-11-20T10:00:00Z'),
        };
        await collection.insertOne(record);
        return { collection, record };
      }),
    );
    const native = await request(app.getHttpServer())
      .get(route())
      .set('Cookie', owner)
      .expect(200);
    const groups = () =>
      request(app.getHttpServer())
        .get('/api/itineraries/' + itineraryId + '/groups')
        .set('Cookie', owner);
    const beforeGroups = await groups().expect(200);
    expect(native.body).not.toHaveProperty('converted');
    expect(call).not.toHaveBeenCalled();

    const first = await converted()
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const { converted: result, ...nativeFields } = first.body;
    expect(nativeFields).toEqual(native.body);
    expect(result).toMatchObject({
      currency: 'EGP',
      total: 28.52,
      byCategory: {
        FOOD: 20.52,
        ACCOMMODATION: 0,
        IN_CITY_TRANSPORT: 0,
        ACTIVITIES: 5,
        INTERCITY_TRANSPORT: 3,
      },
      days: [
        { dayId: String(dayId), date: '2024-02-29', total: 28.52 },
        { date: '2024-03-01', total: 0 },
      ],
      exchangeRates: {
        status: 'fresh',
        rateDate: '2024-02-29',
        provider: 'FXRatesAPI',
      },
    });

    await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Cookie', owner)
      .send({ preferredCurrency: 'EUR' })
      .expect(200);
    expect((await converted().expect(200)).body.converted).toMatchObject({
      currency: 'EUR',
      total: 7.14,
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(route())
          .set('Cookie', owner)
          .expect(200)
      ).body,
    ).toEqual(native.body);
    expect((await groups().expect(200)).body).toEqual(beforeGroups.body);
    for (const { collection, record } of fixtures) {
      expect(await collection.findOne({ _id: record._id })).toEqual(record);
    }
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated, nonowner PUBLIC and invalid query requests before fetching rates', async () => {
    await request(app.getHttpServer())
      .get(route() + '?convert=preferred')
      .expect(401);
    await request(app.getHttpServer())
      .get(route() + '?convert=preferred')
      .set('Cookie', visitor)
      .expect(404);
    await request(app.getHttpServer())
      .get(route() + '?convert=')
      .set('Cookie', owner)
      .expect(400);
    await request(app.getHttpServer())
      .get(route() + '?convert=preferred&convert=preferred')
      .set('Cookie', owner)
      .expect(400);
    expect(call).not.toHaveBeenCalled();
    expect(await cache().countDocuments()).toBe(0);
  });

  it('creates one shared cache and fetches once across two application instances', async () => {
    expect(db).not.toBe(peerDb);
    call.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return rateResponse();
    });
    const results = await Promise.all([
      converted(),
      converted(peer),
      converted(peer),
      converted(),
    ]);
    for (const response of results) {
      expect(response.status).toBe(200);
      expect(response.body.converted.exchangeRates.status).toBe('fresh');
    }
    expect(call).toHaveBeenCalledTimes(1);
    expect(await cache().findOne({ _id: cacheId })).toMatchObject({
      attempts: 1,
      status: 'succeeded',
      lastGood: { rateDate: '2024-02-29', rates: { EUR: '0.5', EGP: '2' } },
    });
  });

  it.each(['failed', 'pending'] as const)(
    'recovers one %s claim after its cooldown with a bounded daily budget',
    async (status) => {
      call.mockImplementation(async () => new Response(null, { status: 429 }));
      const first = await converted().expect(503);
      expect(first.body).toMatchObject({
        code: 'EXCHANGE_RATES_UNAVAILABLE',
        missingPairs: [
          { source: 'EUR', target: 'EGP' },
          { source: 'USD', target: 'EGP' },
        ],
      });
      await converted(peer).expect(503);
      expect(call).toHaveBeenCalledTimes(1);
      await cache().updateOne(
        { _id: cacheId },
        { $set: { status, retryAfter: new Date(Date.now() - 1_000) } },
      );
      const results = await Promise.all([converted(), converted(peer)]);
      expect(results.map(({ status: code }) => code)).toEqual([503, 503]);
      expect(call).toHaveBeenCalledTimes(2);
      await cache().updateOne(
        { _id: cacheId },
        { $set: { retryAfter: new Date(Date.now() - 1_000) } },
      );
      await converted().expect(503);
      expect(call).toHaveBeenCalledTimes(2);

      await cache().updateOne(
        { _id: cacheId },
        { $set: { refreshDay: '2024-02-29' } },
      );
      call.mockImplementation(async () => rateResponse());
      await converted(peer).expect(200);
      expect(call).toHaveBeenCalledTimes(3);
      expect(await cache().findOne({ _id: cacheId })).toMatchObject({
        attempts: 1,
        status: 'succeeded',
      });
    },
  );

  it('serves the prior complete snapshot on an incomplete next-day refresh', async () => {
    await converted().expect(200);
    const before = await cache().findOne({ _id: cacheId });
    await cache().updateOne(
      { _id: cacheId },
      { $set: { refreshDay: '2024-02-29' } },
    );
    call.mockImplementation(async () =>
      Response.json({
        success: true,
        base: 'USD',
        date: providerDate,
        timestamp: Date.parse(providerDate) / 1000,
        rates: { USD: 1 },
      }),
    );
    const result = await converted(peer).expect(200);
    expect(result.body.converted.exchangeRates).toEqual({
      status: 'cached_fallback',
      rateDate: '2024-02-29',
      provider: 'FXRatesAPI',
    });
    expect((await cache().findOne({ _id: cacheId }))?.lastGood).toEqual(
      before?.lastGood,
    );
  });

  it('converts a complete budget snapshot across a concurrent commit and ignores rolled-back data', async () => {
    let unblock!: () => void;
    let entered!: () => void;
    const stopped = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const enteredProvider = new Promise<void>((resolve) => {
      entered = resolve;
    });
    call.mockImplementation(async () => {
      entered();
      await stopped;
      return rateResponse();
    });
    const pending = converted().then((response) => response);
    const entries = db.model('BudgetEntry');
    const session = await db.startSession();
    try {
      await Promise.race([
        enteredProvider,
        pending.then(({ status }) => {
          throw new Error(
            'Request finished before provider with status ' + status,
          );
        }),
      ]);
      session.startTransaction();
      await entries.updateOne(
        { dayId, currency: 'USD' },
        { $set: { amount: 500 } },
        { session },
      );
      await session.abortTransaction();
      await request(peer.getHttpServer())
        .get(route())
        .set('Cookie', owner)
        .expect(200)
        .expect(({ body }) =>
          expect(
            body.totals.find(
              ({ currency }: { currency: string }) => currency === 'USD',
            ).total,
          ).toBe(10.01),
        );
      await session.withTransaction(async () => {
        await entries.updateOne(
          { dayId, currency: 'USD' },
          { $set: { amount: 11.01 } },
          { session },
        );
      });
    } finally {
      await session.endSession();
      unblock();
    }
    const earlier = await pending;
    expect(earlier.status).toBe(200);
    expect(earlier.body.converted.total).toBe(28.52);
    const later = await converted(peer).expect(200);
    expect(later.body.converted.total).toBe(30.52);
  });

  it('documents opt-in query, both responses, the error and cookie auth in Swagger', () => {
    const swagger = SwaggerModule.createDocument(app, createSwaggerConfig());
    const operation =
      swagger.paths['/api/itineraries/{id}/budget-summary'].get!;
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'query',
          name: 'convert',
          required: false,
        }),
      ]),
    );
    expect(operation.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            anyOf: [
              { $ref: '#/components/schemas/ItineraryBudgetTotalsResponseDto' },
              {
                $ref: '#/components/schemas/ConvertedBudgetSummaryResponseDto',
              },
            ],
          },
        },
      },
    });
    expect(operation.responses['503']).toMatchObject({
      description: expect.stringContaining('EXCHANGE_RATES_UNAVAILABLE'),
    });
    expect(operation.security).toContainEqual({ access_token: [] });
    expect(
      swagger.components?.schemas?.BudgetExchangeRateDetailsDto,
    ).toMatchObject({
      properties: {
        rateDate: { type: 'string', format: 'date', nullable: true },
      },
    });
  });
});
