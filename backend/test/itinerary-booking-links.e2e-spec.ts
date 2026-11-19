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
import { BudgetEntriesService } from '../src/itineraries/budget-entries.service';
import { ExchangeRatesService } from '../src/itineraries/exchange-rates.service';
import { ReportsModule } from '../src/reports/reports.module';
import { AdminReportsService } from '../src/reports/admin-reports.service';
import { ReportContentType } from '../src/reports/enums/report.enums';
import { ModerationAction } from '../src/reports/enums/moderation.enums';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { createSwaggerConfig } from '../src/common/swagger.config';

describe('ITN-27 isolated booking links, budgets and financial isolation', () => {
  let app: INestApplication,
    db: Connection,
    owner: string,
    otherOwner: string,
    auth: string[],
    other: string[],
    itineraries: ItinerariesService;
  let london: Types.ObjectId,
    from: Types.ObjectId,
    to: Types.ObjectId,
    airline: Types.ObjectId,
    country: Types.ObjectId;
  let count = 0;
  const date = (s: string) => new Date(s + 'T00:00:00Z');
  const login = async (email: string) => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'ITN27',
        lastName: 'User',
        email,
        password: 'TestPassword123',
        acceptTerms: true,
      })
      .expect(201);
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'TestPassword123' })
      .expect(200);
    return (r.headers['set-cookie'] as unknown as string[]).map(
      (c) => c.split(';')[0],
    );
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(process.env.MONGODB_URI!),
        ItinerariesModule,
        ReportsModule,
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
    db = app.get(getConnectionToken());
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
    expect((await db.db!.admin().command({ hello: 1 })).setName).toBeTruthy();
    for (const m of Object.values(db.models)) await m.init();
    auth = await login('itn27-owner@example.com');
    other = await login('itn27-other@example.com');
    owner = (await db
      .model('User')
      .findOne({ email: 'itn27-owner@example.com' }))!._id.toString();
    otherOwner = (await db
      .model('User')
      .findOne({ email: 'itn27-other@example.com' }))!._id.toString();
    country = (
      await db
        .model('Country')
        .create({ code: 'GB', name: 'United Kingdom', currency: 'GBP' })
    )._id;
    await db
      .model('Country')
      .create({ code: 'EG', name: 'Egypt', currency: 'EGP' });
    london = (
      await db
        .model('City')
        .create({ cityId: 'london', name: 'London', countryCode: 'GB' })
    )._id;
    cairo = (
      await db
        .model('City')
        .create({ cityId: 'cairo', name: 'Cairo', countryCode: 'EG' })
    )._id;
    from = (
      await db.model('Airport').create({
        iataCode: 'CAI',
        name: 'Cairo',
        city: 'cairo',
        country: 'EG',
        timezone: 'Africa/Cairo',
      })
    )._id;
    to = (
      await db.model('Airport').create({
        iataCode: 'LHR',
        name: 'London',
        city: 'london',
        country: 'GB',
        timezone: 'Europe/London',
      })
    )._id;
    airline = (
      await db
        .model('Airline')
        .create({ name: 'ITN27 Air', code: 'IT', isActive: true })
    )._id;
    await db
      .collection('currencies')
      .insertMany(['USD', 'EUR', 'GBP', 'EGP'].map((code) => ({ code })));
    itineraries = app.get(ItinerariesService);
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
      const p = process.env.UPLOADS_DIR;
      if (
        p &&
        path.dirname(p) === tmpdir() &&
        path.basename(p).startsWith('travel-uploads-e2e-')
      )
        await rm(p, { recursive: true, force: true });
    }
  });
  async function seed(n = 3, start = '2040-12-31', user = owner) {
    const parent = await db.model('Itinerary').create({
      userId: user,
      title: 'ITN27',
      countryIds: ['GB', 'EG'],
      startDate: date(start),
    });
    const days = n
      ? await db.model('ItineraryDay').create(
          Array.from({ length: n }, (_, i) => ({
            itineraryId: parent._id,
            dayNumber: i + 1,
            cityId: 'london',
            notes: 'Keep',
          })),
        )
      : [];
    return { id: parent._id.toString(), days };
  }
  async function bookedFlight(round = false, user = owner) {
    const suffix = ++count;
    const flight = await db.model('Flight').create({
      airline,
      flightNumber: 'IT' + suffix,
      departureAirport: from,
      arrivalAirport: to,
      departureTime: new Date('2040-12-30T23:00Z'),
      arrivalTime: new Date('2040-12-31T02:00Z'),
      departureLocalDate: '2040-12-31',
      durationMinutes: 180,
      status: 'SCHEDULED',
    });
    const returning = round
      ? await db.model('Flight').create({
          airline,
          flightNumber: 'RT' + suffix,
          departureAirport: to,
          arrivalAirport: from,
          departureTime: new Date('2041-01-03T10:00Z'),
          arrivalTime: new Date('2041-01-03T14:00Z'),
          departureLocalDate: '2041-01-03',
          durationMinutes: 240,
          status: 'SCHEDULED',
        })
      : undefined;
    const booking = await db.model('FlightBooking').create({
      user,
      outboundFlight: flight._id,
      ...(returning ? { returnFlight: returning._id } : {}),
      tripType: round ? 'ROUND_TRIP' : 'ONE_WAY',
      cabinClass: 'ECONOMY',
      passengers: [
        {
          firstName: 'Private',
          lastName: 'Passenger',
          type: 'ADULT',
          dateOfBirth: date('2000-01-01'),
          documentType: 'PASSPORT',
          documentNumber: 'SECRET-PASSPORT',
        },
      ],
      totalPrice: 300,
      baggageFees: 30,
      currency: 'USD',
      status: 'CONFIRMED',
      bookingReference: 'FL' + suffix,
    });
    await db.collection('payments').insertOne({
      bookingId: booking._id,
      userId: new Types.ObjectId(user),
      bookingType: 'flight',
      amount: 330,
      currency: 'USD',
      status: 'succeeded',
    });
    return { booking, flight, returning };
  }
  async function bookedHotel(
    start = '2040-12-31',
    end = '2041-01-03',
    amount = 100,
    user = owner,
  ) {
    const hotel = await db.model('Hotel').create({
      name: 'ITN27 Hotel',
      address: 'London',
      city: london,
      country,
      starRating: 4,
    });
    const booking = await db.model('HotelBooking').create({
      user,
      hotel: hotel._id,
      rooms: [
        {
          room: new Types.ObjectId(),
          pricePerNight: 33.33,
          adults: 1,
          children: 0,
        },
      ],
      checkIn: date(start),
      checkOut: date(end),
      totalPrice: amount,
      currency: 'USD',
      status: 'CONFIRMED',
      bookingReference: 'HT' + ++count,
    });
    await db.collection('payments').insertOne({
      bookingId: booking._id,
      userId: new Types.ObjectId(user),
      bookingType: 'hotel',
      amount,
      currency: 'USD',
      status: 'succeeded',
    });
    return { booking, hotel };
  }
  const link = (
    id: string,
    type: string,
    bookingId: string,
    dayIds: string[],
    cookies = auth,
  ) =>
    request(app.getHttpServer())
      .post('/api/itineraries/' + id + '/bookings')
      .set('Cookie', cookies)
      .send({ bookingType: type, bookingId, dayIds });
  const list = (id: string, cookies = auth) =>
    request(app.getHttpServer())
      .get('/api/itineraries/' + id + '/bookings')
      .set('Cookie', cookies);
  const unlink = (id: string, selected: string, cookies = auth) =>
    request(app.getHttpServer())
      .delete('/api/itineraries/' + id + '/bookings/' + selected)
      .set('Cookie', cookies);
  const totals = (id: string) =>
    request(app.getHttpServer())
      .get('/api/itineraries/' + id + '/budget-summary')
      .set('Cookie', auth);
  async function financial() {
    return JSON.stringify(
      await Promise.all(
        [
          'flightbookings',
          'hotelbookings',
          'payments',
          'refunds',
          'flights',
        ].map((name) => db.collection(name).find().sort({ _id: 1 }).toArray()),
      ),
    );
  }
  it.each([false, true])(
    'links direct flight roundTrip=%s to OUTBOUND arrival and charges full amount once',
    async (round) => {
      const data = await seed(),
        b = await bookedFlight(round),
        before = await financial();
      const r = await link(data.id, 'flight', String(b.booking._id), [
        String(data.days[0]._id),
      ]).expect(201);
      expect(r.body).toMatchObject({
        state: 'ACTIVE',
        bookingAmount: 330,
        currency: 'USD',
        allocations: [
          { date: '2040-12-31', category: 'INTERCITY_TRANSPORT', amount: 330 },
        ],
      });
      expect((await totals(data.id).expect(200)).body.totals[0].total).toBe(
        330,
      );
      expect(await financial()).toBe(before);
      expect(
        JSON.stringify((await list(data.id).expect(200)).body),
      ).not.toContain('SECRET-PASSPORT');
    },
  );
  it('allocates the complete hotel stay across year boundary with exact cents and reconciled reports', async () => {
    const data = await seed(),
      b = await bookedHotel(),
      before = await financial();
    const r = await link(
      data.id,
      'hotel',
      String(b.booking._id),
      data.days.map((d) => String(d._id)).reverse(),
    ).expect(201);
    expect(r.body.allocations.map((a: { amount: number }) => a.amount)).toEqual(
      [33.34, 33.33, 33.33],
    );
    expect(r.body.allocations.map((a: { date: string }) => a.date)).toEqual([
      '2040-12-31',
      '2041-01-01',
      '2041-01-02',
    ]);
    const native = (await totals(data.id).expect(200)).body;
    expect(native.totals[0]).toMatchObject({
      currency: 'USD',
      total: 100,
      byCategory: { ACCOMMODATION: 100 },
    });
    expect(native.days.map((d: any) => d.totals[0].total)).toEqual([
      33.34, 33.33, 33.33,
    ]);
    expect(
      (await itineraries.findGroups(owner, data.id)).groups[0].budgetSubtotals,
    ).toEqual([{ currency: 'USD', total: 100 }]);
    expect(await financial()).toBe(before);
  });
  it('combines each budget source once with separate currencies and display-only ITN-18 conversion', async () => {
    const data = await seed(),
      f = await bookedFlight(),
      h = await bookedHotel();
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(201);
    await link(
      data.id,
      'hotel',
      String(h.booking._id),
      data.days.map((d) => String(d._id)),
    ).expect(201);
    await db.model('BudgetEntry').create([
      {
        dayId: data.days[0]._id,
        category: 'FOOD',
        amount: 10,
        currency: 'USD',
      },
      { dayId: data.days[0]._id, category: 'FOOD', amount: 5, currency: 'EUR' },
    ]);
    await db.model('Activity').create({
      dayId: data.days[0]._id,
      name: 'Ticket',
      description: 'Museum',
      cost: 2,
      currency: 'USD',
    });
    await db.model('TransportCost').create({
      dayId: data.days[0]._id,
      mode: 'BUS',
      fromCityId: 'london',
      toCityId: 'cairo',
      amount: 3,
      currency: 'USD',
    });
    const before = await financial();
    const native = (await totals(data.id).expect(200)).body;
    expect(native.totals.map((r: any) => [r.currency, r.total])).toEqual([
      ['EUR', 5],
      ['USD', 445],
    ]);
    expect(native.totals[1].byCategory).toMatchObject({
      FOOD: 10,
      ACTIVITIES: 2,
      ACCOMMODATION: 100,
      INTERCITY_TRANSPORT: 333,
    });
    await db
      .model('User')
      .updateOne({ _id: owner }, { $set: { 'preferences.currency': 'EUR' } });
    jest.spyOn(app.get(ExchangeRatesService), 'getRates').mockResolvedValue({
      rates: { USD: '1', EUR: '0.5' },
      rateDate: '2040-12-31',
      status: 'fresh',
    } as never);
    const converted = await request(app.getHttpServer())
      .get('/api/itineraries/' + data.id + '/budget-summary?convert=preferred')
      .set('Cookie', auth)
      .expect(200);
    expect(converted.body.converted.currency).toBe('EUR');
    expect(converted.body.converted.total).toBe(227.51);
    expect(converted.body.totals).toEqual(native.totals);
    expect(await financial()).toBe(before);
    await db
      .model('User')
      .updateOne({ _id: owner }, { $set: { 'preferences.currency': 'USD' } });
  });
  it('lists links with GEN-05 pagination and unlinks without touching financial records', async () => {
    const data = await seed(),
      b = await bookedFlight(),
      r = await link(data.id, 'flight', String(b.booking._id), [
        String(data.days[0]._id),
      ]).expect(201),
      before = await financial();
    const items = (await list(data.id).expect(200)).body;
    expect(items).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    expect(items.items[0].id).toBe(r.body.id);
    await unlink(data.id, r.body.id).expect(200);
    await unlink(data.id, r.body.id).expect(404);
    expect((await totals(data.id).expect(200)).body.totals).toEqual([]);
    expect(await financial()).toBe(before);
  });
  it('enforces globally unique links across itineraries and after unlink permits relinking', async () => {
    const a = await seed(),
      b = await seed(),
      f = await bookedFlight();
    const first = await link(a.id, 'flight', String(f.booking._id), [
      String(a.days[0]._id),
    ]).expect(201);
    await link(a.id, 'flight', String(f.booking._id), [
      String(a.days[0]._id),
    ]).expect(409);
    await link(b.id, 'flight', String(f.booking._id), [
      String(b.days[0]._id),
    ]).expect(409);
    expect(
      await db
        .model('ItineraryBookingLink')
        .countDocuments({ bookingId: f.booking._id }),
    ).toBe(1);
    await unlink(a.id, first.body.id).expect(200);
    await link(b.id, 'flight', String(f.booking._id), [
      String(b.days[0]._id),
    ]).expect(201);
  });
  it.each(['PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'])(
    'rejects unbooked status %s',
    async (status) => {
      const data = await seed(),
        b = await bookedFlight();
      await db
        .model('FlightBooking')
        .updateOne({ _id: b.booking._id }, { $set: { status } });
      await link(data.id, 'flight', String(b.booking._id), [
        String(data.days[0]._id),
      ]).expect(409);
    },
  );
  it('supports Completed bookings and retains cancelled/refunded links with zero cost', async () => {
    const data = await seed(),
      b = await bookedHotel();
    await db
      .model('HotelBooking')
      .updateOne({ _id: b.booking._id }, { $set: { status: 'COMPLETED' } });
    await link(
      data.id,
      'hotel',
      String(b.booking._id),
      data.days.map((d) => String(d._id)),
    ).expect(201);
    await db
      .model('HotelBooking')
      .collection.updateOne(
        { _id: b.booking._id },
        { $set: { status: 'CANCELLED' } },
      );
    await db.collection('refunds').insertOne({
      bookingId: b.booking._id,
      amount: 75,
      currency: 'USD',
      status: 'refunded',
    });
    const before = await financial(),
      views = (await list(data.id).expect(200)).body;
    expect(views.items[0]).toMatchObject({
      state: 'INACTIVE',
      allocations: [],
    });
    expect((await totals(data.id).expect(200)).body.totals).toEqual([]);
    expect(
      (await itineraries.findGroups(owner, data.id)).groups[0].budgetSubtotals,
    ).toEqual([]);
    expect(await financial()).toBe(before);
  });
  it('updates costs from changed stored reservation amounts without subtracting refunds twice', async () => {
    const data = await seed(),
      b = await bookedFlight();
    await link(data.id, 'flight', String(b.booking._id), [
      String(data.days[0]._id),
    ]).expect(201);
    await db
      .model('FlightBooking')
      .updateOne(
        { _id: b.booking._id },
        { $set: { totalPrice: 250, baggageFees: 20 } },
      );
    await db.collection('refunds').insertOne({
      bookingId: b.booking._id,
      amount: 60,
      currency: 'USD',
      status: 'refunded',
    });
    expect((await totals(data.id).expect(200)).body.totals[0].total).toBe(270);
  });
  it('enforces both ownership checks, private/Public restrictions and no cross-account financial leakage', async () => {
    const own = await seed(),
      someone = await seed(3, '2040-12-31', otherOwner),
      f = await bookedFlight(false, otherOwner);
    await link(own.id, 'flight', String(f.booking._id), [
      String(own.days[0]._id),
    ]).expect(404);
    await link(someone.id, 'flight', String(f.booking._id), [
      String(someone.days[0]._id),
    ]).expect(404);
    await link(
      own.id,
      'flight',
      String(f.booking._id),
      [String(own.days[0]._id)],
      [],
    ).expect(401);
    await db
      .model('Itinerary')
      .updateOne({ _id: own.id }, { $set: { visibility: 'PUBLIC' } });
    await list(own.id, other).expect(404);
    await list(own.id, []).expect(401);
    const valid = await bookedFlight();
    const linked = await link(own.id, 'flight', String(valid.booking._id), [
      String(own.days[0]._id),
    ]).expect(201);
    await unlink(own.id, linked.body.id, other).expect(404);
    await unlink(own.id, linked.body.id, []).expect(401);
    await db
      .model('FlightBooking')
      .updateOne({ _id: valid.booking._id }, { $set: { user: otherOwner } });
    const view = (await list(own.id).expect(200)).body.items[0];
    expect(view).toMatchObject({
      state: 'INACCESSIBLE',
      bookingReference: null,
      bookingStatus: null,
      bookingAmount: null,
      currency: null,
      allocations: [],
    });
    expect((await totals(own.id).expect(200)).body.totals).toEqual([]);
  });
  it('rejects wrong dates/cities, incomplete stays and cross-itinerary days', async () => {
    const data = await seed(),
      otherDays = await seed(),
      f = await bookedFlight(),
      h = await bookedHotel();
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[1]._id),
    ]).expect(409);
    await link(data.id, 'flight', String(f.booking._id), [
      String(otherDays.days[0]._id),
    ]).expect(404);
    await link(data.id, 'hotel', String(h.booking._id), [
      String(data.days[0]._id),
    ]).expect(409);
    await db
      .model('ItineraryDay')
      .updateOne({ _id: data.days[1]._id }, { $set: { cityId: 'cairo' } });
    await link(
      data.id,
      'hotel',
      String(h.booking._id),
      data.days.map((d) => String(d._id)),
    ).expect(409);
  });
  it('makes reordered, edited or changed bookings inactive until compatible again', async () => {
    const data = await seed(),
      b = await bookedFlight();
    await link(data.id, 'flight', String(b.booking._id), [
      String(data.days[0]._id),
    ]).expect(201);
    await itineraries.reorderDay(owner, data.id, String(data.days[0]._id), {
      newPosition: 2,
    });
    expect((await list(data.id).expect(200)).body.items[0].state).toBe(
      'INACTIVE',
    );
    expect((await totals(data.id).expect(200)).body.totals).toEqual([]);
    await itineraries.reorderDay(owner, data.id, String(data.days[0]._id), {
      newPosition: 1,
    });
    expect((await totals(data.id).expect(200)).body.totals[0].total).toBe(330);
    await db
      .model('Flight')
      .collection.updateOne(
        { _id: b.flight._id },
        { $set: { arrivalTime: new Date('2041-01-01T02:00Z') } },
      );
    expect((await list(data.id).expect(200)).body.items[0].state).toBe(
      'INACTIVE',
    );
  });
  it('removes entire multi-night links on one day deletion and includes surviving allocations in deletion totals', async () => {
    const data = await seed(),
      h = await bookedHotel(),
      f = await bookedFlight();
    await link(
      data.id,
      'hotel',
      String(h.booking._id),
      data.days.map((d) => String(d._id)),
    ).expect(201);
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(201);
    const before = await financial();
    const result = await itineraries.removeDay(
      owner,
      data.id,
      String(data.days[2]._id),
    );
    expect(result.budgetTotals).toEqual([{ currency: 'USD', total: 330 }]);
    expect((await list(data.id).expect(200)).body.total).toBe(1);
    expect(await financial()).toBe(before);
    await itineraries.remove(owner, data.id);
    expect(
      await db
        .model('ItineraryBookingLink')
        .countDocuments({ itineraryId: data.id }),
    ).toBe(0);
    expect(await financial()).toBe(before);
  });
  it('cascades associations during moderation deletion without modifying paid bookings', async () => {
    const data = await seed(),
      f = await bookedFlight();
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(201);
    const before = await financial();
    await app
      .get(AdminReportsService)
      .moderate(
        owner,
        { type: ReportContentType.ITINERARY, id: data.id },
        ModerationAction.DELETE,
      );
    expect(
      await db
        .model('ItineraryBookingLink')
        .countDocuments({ itineraryId: data.id }),
    ).toBe(0);
    expect(await financial()).toBe(before);
  });
  it('rolls back the parent write and inserted association after injected failure', async () => {
    const data = await seed(),
      f = await bookedFlight(),
      before = await db.model('Itinerary').findById(data.id).lean();
    const collection = db.model('ItineraryBookingLink').collection,
      original = collection.insertOne.bind(collection);
    jest.spyOn(collection, 'insertOne').mockImplementationOnce((async (
      ...args: unknown[]
    ) => {
      await (original as (...args: unknown[]) => Promise<unknown>)(...args);
      throw new Error('ITN27 injected failure');
    }) as never);
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(500);
    expect(await db.model('Itinerary').findById(data.id).lean()).toEqual(
      before,
    );
    expect(
      await db
        .model('ItineraryBookingLink')
        .countDocuments({ itineraryId: data.id }),
    ).toBe(0);
  });
  it('handles concurrent global duplicate attempts without double-counting', async () => {
    const a = await seed(),
      b = await seed(),
      f = await bookedFlight();
    const results = await Promise.all([
      link(a.id, 'flight', String(f.booking._id), [String(a.days[0]._id)]),
      link(b.id, 'flight', String(f.booking._id), [String(b.days[0]._id)]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db
        .model('ItineraryBookingLink')
        .countDocuments({ bookingId: f.booking._id }),
    ).toBe(1);
  });
  it('coordinates linking racing with day deletion without orphan links', async () => {
    const data = await seed(),
      f = await bookedFlight();
    const result = await Promise.allSettled([
      link(data.id, 'flight', String(f.booking._id), [
        String(data.days[0]._id),
      ]),
      itineraries.removeDay(owner, data.id, String(data.days[0]._id)),
    ]);
    expect(result[1].status).toBe('fulfilled');
    expect(
      await db
        .model('ItineraryBookingLink')
        .countDocuments({ itineraryId: data.id }),
    ).toBe(0);
  });
  it('reads booking status consistently across concurrent cancellation', async () => {
    const data = await seed(),
      f = await bookedFlight();
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(201);
    const model = db.model('Itinerary'),
      original = model.findOne.bind(model);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => (entered = r)),
      gate = new Promise<void>((r) => (release = r));
    jest.spyOn(model, 'findOne').mockImplementationOnce((...args) => {
      const q = original(...args),
        exec = q.exec.bind(q);
      jest.spyOn(q, 'exec').mockImplementationOnce(async () => {
        const v = await exec();
        entered();
        await gate;
        return v;
      });
      return q;
    });
    const pending = app.get(BudgetEntriesService).totals(owner, data.id);
    await ready;
    try {
      await db
        .model('FlightBooking')
        .updateOne({ _id: f.booking._id }, { $set: { status: 'CANCELLED' } });
    } finally {
      release();
    }
    expect((await pending).totals[0].total).toBe(330);
    expect((await totals(data.id).expect(200)).body.totals).toEqual([]);
  });
  it.each(['legs', 'segments', 'outboundSegments', 'outboundFlight'])(
    'rejects unsupported connecting structure %s',
    async (field) => {
      const data = await seed(),
        f = await bookedFlight();
      await db
        .model('FlightBooking')
        .collection.updateOne(
          { _id: f.booking._id },
          { $set: { [field]: [f.flight._id] } },
        );
      await link(data.id, 'flight', String(f.booking._id), [
        String(data.days[0]._id),
      ]).expect(409);
    },
  );
  it('rejects malformed input and unknown fields without financial side effects', async () => {
    const data = await seed(),
      f = await bookedFlight();
    await link('bad', 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(400);
    await link(data.id, 'flight', 'bad', [String(data.days[0]._id)]).expect(
      400,
    );
    await link(data.id, 'flight', String(new Types.ObjectId()), [
      String(data.days[0]._id),
    ]).expect(404);
    await link(data.id, 'flight', String(f.booking._id), []).expect(400);
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
      String(data.days[0]._id),
    ]).expect(400);
    await request(app.getHttpServer())
      .post('/api/itineraries/' + data.id + '/bookings')
      .set('Cookie', auth)
      .send({
        bookingType: 'flight',
        bookingId: String(f.booking._id),
        dayIds: [String(data.days[0]._id)],
        amount: 1,
      })
      .expect(400);
  });
  it('rejects malformed reverse return routes and unfinalized references', async () => {
    const data = await seed(),
      f = await bookedFlight(true);
    await db
      .model('Flight')
      .collection.updateOne(
        { _id: f.returning!._id },
        { $set: { departureAirport: from } },
      );
    await link(data.id, 'flight', String(f.booking._id), [
      String(data.days[0]._id),
    ]).expect(409);
    const fresh = await bookedFlight();
    await db
      .model('FlightBooking')
      .updateOne(
        { _id: fresh.booking._id },
        { $unset: { bookingReference: 1 } },
      );
    await link(data.id, 'flight', String(fresh.booking._id), [
      String(data.days[0]._id),
    ]).expect(409);
  });
  it.each(['unlink', 'day', 'moderation'] as const)(
    'rolls back association and parent/day changes when %s cleanup fails after deletion',
    async (kind) => {
      const data = await seed(),
        booking = await bookedHotel();
      const linked = await link(
        data.id,
        'hotel',
        String(booking.booking._id),
        data.days.map((day) => String(day._id)),
      ).expect(201);
      await db
        .model('BudgetEntry')
        .create({
          dayId: data.days[0]._id,
          category: 'FOOD',
          amount: 1,
          currency: 'USD',
        });
      const state = async () =>
        JSON.stringify(
          await Promise.all(
            [
              'Itinerary',
              'ItineraryDay',
              'ItineraryBookingLink',
              'BudgetEntry',
            ].map((name) => db.model(name).find({}).sort({ _id: 1 }).lean()),
          ),
        );
      const before = await state(),
        prices = await financial(),
        collection = db.model('ItineraryBookingLink').collection;
      const method = kind === 'unlink' ? 'deleteOne' : 'deleteMany',
        original = collection[method].bind(collection);
      jest.spyOn(collection, method).mockImplementationOnce((async (
        ...args: unknown[]
      ) => {
        await (original as (...values: unknown[]) => Promise<unknown>)(...args);
        throw new Error('ITN27 cascade failure');
      }) as never);
      if (kind === 'unlink') await unlink(data.id, linked.body.id).expect(500);
      else if (kind === 'day')
        await expect(
          itineraries.removeDay(owner, data.id, String(data.days[0]._id)),
        ).rejects.toThrow();
      else
        await expect(
          app
            .get(AdminReportsService)
            .moderate(
              owner,
              { type: ReportContentType.ITINERARY, id: data.id },
              ModerationAction.DELETE,
            ),
        ).rejects.toThrow();
      expect(await state()).toBe(before);
      expect(await financial()).toBe(prices);
    },
  );
  it('documents PDF link endpoint, owner-only list/unlink and connecting limitation', () => {
    const doc = SwaggerModule.createDocument(app, createSwaggerConfig());
    for (const [path, method] of [
      ['/api/itineraries/{id}/bookings', 'post'],
      ['/api/itineraries/{id}/bookings', 'get'],
      ['/api/itineraries/{id}/bookings/{linkId}', 'delete'],
    ] as const)
      expect(doc.paths[path][method]!.security).toContainEqual({
        access_token: [],
      });
    expect(
      doc.paths['/api/itineraries/{id}/bookings'].post!.description,
    ).toContain('Connecting journeys are unsupported');
  });
});
