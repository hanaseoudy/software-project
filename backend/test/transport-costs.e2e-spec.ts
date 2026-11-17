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
import { TransportCostsService } from '../src/itineraries/transport-costs.service';
import { ItinerariesService } from '../src/itineraries/itineraries.service';
import {
  IntercityTransportMode,
  TransportCost,
} from '../src/itineraries/schemas/transport-cost.schema';
import { Itinerary } from '../src/itineraries/schemas/itinerary.schema';
import { ItineraryDay } from '../src/itineraries/schemas/itinerary-day.schema';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { createSwaggerConfig } from '../src/common/swagger.config';

// setup-e2e.ts refuses remote hosts and creates a disposable database.
// $env:TEST_MONGODB_URI='mongodb://127.0.0.1:27177'
// $env:NODE_OPTIONS='--experimental-vm-modules'
// npm run test:e2e -- --runInBand transport-costs
// The coordinated deletion helper is a protocol fixture, NOT ITN-07 code.
describe('ITN-16 transport costs on an isolated local replica set', () => {
  let app: INestApplication,
    db: Connection,
    service: TransportCostsService,
    itineraries: ItinerariesService;
  let auth: string[],
    other: string[],
    owner: Types.ObjectId,
    otherOwner: Types.ObjectId;
  const oid = () => new Types.ObjectId().toString();
  const costs = () => db.model<TransportCost>('TransportCost');
  const parents = () => db.model<Itinerary>('Itinerary');
  const days = () => db.model<ItineraryDay>('ItineraryDay');
  const http = () => app.getHttpServer();
  const fields = {
    mode: IntercityTransportMode.TRAIN,
    fromCityId: 'cairo',
    toCityId: 'new_york',
    amount: 12.5,
    currency: 'USD',
  };
  const post = (parent: string, body: object, cookies = auth) =>
    request(http())
      .post(`/api/itineraries/${parent}/transport-costs`)
      .set('Cookie', cookies)
      .send(body);
  const patch = (id: string, body: object, cookies = auth) =>
    request(http())
      .patch(`/api/transport-costs/${id}`)
      .set('Cookie', cookies)
      .send(body);
  const del = (id: string, cookies = auth) =>
    request(http()).delete(`/api/transport-costs/${id}`).set('Cookie', cookies);
  async function login(email: string) {
    const password = 'TestPassword123';
    await request(http())
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email,
        password,
        acceptTerms: true,
      })
      .expect(201);
    const result = await request(http())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return (result.headers['set-cookie'] as unknown as string[]).map(
      (value) => value.split(';')[0],
    );
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(process.env.MONGODB_URI!),
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
    db = app.get(getConnectionToken());
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
    expect((await db.db!.admin().command({ hello: 1 })).setName).toBeTruthy();
    for (const model of Object.values(db.models)) await model.init();
    await db.model('Currency').create([{ code: 'USD' }, { code: 'EUR' }]);
    await db
      .model('Country')
      .create({ code: 'EG', name: 'Egypt', currency: 'EGP' });
    await db.model('City').create([
      { cityId: 'cairo', name: 'Cairo', countryCode: 'EG' },
      { cityId: 'new_york', name: 'New York', countryCode: 'US' },
      { cityId: 'frankfurt', name: 'Frankfurt', countryCode: 'DE' },
    ]);
    auth = await login('transport-owner@example.com');
    other = await login('transport-other@example.com');
    owner = (await db
      .model('User')
      .findOne({ email: 'transport-owner@example.com' }))!._id;
    otherOwner = (await db
      .model('User')
      .findOne({ email: 'transport-other@example.com' }))!._id;
    service = app.get(TransportCostsService);
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
      const dir = process.env.UPLOADS_DIR;
      if (
        dir &&
        path.dirname(dir) === tmpdir() &&
        path.basename(dir).startsWith('travel-uploads-e2e-')
      )
        await rm(dir, { recursive: true, force: true });
    }
  });
  async function seed(userId = owner) {
    const parent = await parents().create({
      userId,
      title: 'Transport',
      countryIds: ['EG'],
      startDate: new Date('2028-01-01T00:00:00Z'),
    });
    const ds = await days().create(
      [1, 2].map((dayNumber) => ({
        itineraryId: parent._id,
        dayNumber,
        cityId: 'cairo',
      })),
    );
    return {
      id: parent._id.toString(),
      dayId: ds[0]._id.toString(),
      nextDayId: ds[1]._id.toString(),
    };
  }
  async function entry() {
    const seeded = await seed();
    const created = await post(seeded.id, {
      ...fields,
      dayId: seeded.dayId,
    }).expect(201);
    return { ...seeded, entryId: created.body.id };
  }
  it.each(Object.values(IntercityTransportMode))(
    'creates mode %s using actual GEN-12 city identifiers',
    async (mode) => {
      const { id, dayId } = await seed();
      const result = await post(id, {
        ...fields,
        dayId,
        mode,
        currency: 'usd',
        fromCityId: ' cairo ',
      }).expect(201);
      expect(result.body).toEqual({
        id: expect.any(String),
        dayId,
        mode,
        fromCityId: 'cairo',
        toCityId: 'new_york',
        amount: 12.5,
        currency: 'USD',
      });
    },
  );
  it('allows identical cities and cities unrelated to the day, including zero amount', async () => {
    const { id, dayId } = await seed();
    await post(id, {
      ...fields,
      dayId,
      fromCityId: 'frankfurt',
      toCityId: 'frankfurt',
      amount: 0,
    }).expect(201);
    expect(await db.model('BudgetEntry').countDocuments({ dayId })).toBe(0);
  });
  it('partially updates, reassigns within the itinerary and deletes only one entry', async () => {
    const { id, dayId, nextDayId, entryId } = await entry();
    const sibling = await post(id, { ...fields, dayId }).expect(201);
    const updated = await patch(entryId, { amount: 0, currency: 'EUR' }).expect(
      200,
    );
    expect(updated.body).toMatchObject({
      id: entryId,
      dayId,
      amount: 0,
      mode: 'TRAIN',
      currency: 'EUR',
    });
    const moved = await patch(entryId, { dayId: nextDayId }).expect(200);
    expect(moved.body).toMatchObject({
      id: entryId,
      dayId: nextDayId,
      amount: 0,
      currency: 'EUR',
    });
    await del(entryId).expect(200);
    await del(entryId).expect(404);
    await patch(entryId, { amount: 1 }).expect(404);
    expect(await costs().exists({ _id: sibling.body.id })).toBeTruthy();
    expect(await days().exists({ _id: nextDayId })).toBeTruthy();
  });
  it.each(['dayId', 'mode', 'fromCityId', 'toCityId', 'amount', 'currency'])(
    'rejects missing/null required %s and null PATCH',
    async (field) => {
      const { id, dayId } = await seed();
      const body = { ...fields, dayId };
      for (const value of [undefined, null]) {
        const result = await post(id, { ...body, [field]: value }).expect(400);
        expect(result.body.errors).toHaveProperty(field);
      }
      const created = await post(id, body).expect(201);
      const result = await patch(created.body.id, { [field]: null }).expect(
        400,
      );
      expect(result.body.errors).toHaveProperty(field);
    },
  );
  it.each([
    { mode: 'TAXI' },
    { mode: 'train' },
    { mode: 1 },
    { fromCityId: 'CAI' },
    { toCityId: 'unknown' },
    { fromCityId: '  ' },
    { toCityId: '' },
    { fromCityId: {} },
    { toCityId: [] },
    { currency: 'ZZZ' },
    { currency: 'US' },
    { currency: {} },
    { amount: -1 },
    { amount: '2' },
    { amount: false },
    { amount: 0.001 },
    { dayId: 'bad' },
    { dayId: 1 },
    { itineraryId: 'override' },
    { userId: 'override' },
  ])(
    'rejects invalid/unsupported fields for POST and PATCH: %j',
    async (values) => {
      const { id, dayId, entryId } = await entry();
      const created = await post(id, { ...fields, dayId, ...values }).expect(
        400,
      );
      expect(created.body.errors).toBeDefined();
      await patch(entryId, values).expect(400);
      expect(await costs().findById(entryId).lean()).toMatchObject(fields);
    },
  );
  it('rejects empty PATCH with a field-level body error', async () => {
    const { entryId } = await entry();
    const result = await patch(entryId, {}).expect(400);
    expect(result.body.errors).toHaveProperty('body');
  });
  it('checks malformed/nonexistent IDs, wrong itinerary and cross-itinerary reassignment', async () => {
    const a = await entry(),
      b = await seed();
    await post('bad', { ...fields, dayId: a.dayId }).expect(400);
    await post(oid(), { ...fields, dayId: a.dayId }).expect(404);
    await post(a.id, { ...fields, dayId: oid() }).expect(404);
    await post(a.id, { ...fields, dayId: b.dayId }).expect(404);
    await patch('bad', { amount: 1 }).expect(400);
    await del('bad').expect(400);
    await patch(oid(), { amount: 1 }).expect(404);
    await del(oid()).expect(404);
    await patch(a.entryId, { dayId: oid() }).expect(404);
    await patch(a.entryId, { dayId: b.dayId }).expect(404);
    expect((await costs().findById(a.entryId))!.dayId.toString()).toBe(a.dayId);
  });
  it("uses real JWT/session authentication and hides other owners' records", async () => {
    const a = await entry(),
      b = await seed(otherOwner);
    const foreign = await post(
      b.id,
      { ...fields, dayId: b.dayId },
      other,
    ).expect(201);
    await request(http())
      .post(`/api/itineraries/${a.id}/transport-costs`)
      .send({ ...fields, dayId: a.dayId })
      .expect(401);
    await request(http())
      .patch(`/api/transport-costs/${a.entryId}`)
      .send({ amount: 1 })
      .expect(401);
    await request(http())
      .delete(`/api/transport-costs/${a.entryId}`)
      .expect(401);
    await post(b.id, { ...fields, dayId: b.dayId }).expect(404);
    await post(a.id, { ...fields, dayId: b.dayId }).expect(404);
    await patch(foreign.body.id, { amount: 1 }).expect(404);
    await del(foreign.body.id).expect(404);
    await patch(a.entryId, { dayId: b.dayId }).expect(404);
    expect((await costs().findById(foreign.body.id))!.amount).toBe(
      fields.amount,
    );
  });
  it('returns 404 for orphaned legacy records without exposing their contents', async () => {
    const { entryId, dayId } = await entry();
    await days().deleteOne({ _id: dayId });
    await patch(entryId, { amount: 1 }).expect(404);
    await del(entryId).expect(404);
  });
  it('validates omitted fields in the resulting record, rather than just the PATCH fragment', async () => {
    const { entryId } = await entry();
    await costs().collection.updateOne(
      { _id: new Types.ObjectId(entryId) },
      { $set: { fromCityId: 'unsupported' } },
    );
    const result = await patch(entryId, { amount: 99 }).expect(400);
    expect(result.body.errors).toHaveProperty('fromCityId');
    expect((await costs().findById(entryId))!.amount).toBe(fields.amount);
    await patch(entryId, { fromCityId: 'cairo' }).expect(200);
  });
  it('serializes concurrent partial updates, reassignments and duplicate deletion', async () => {
    const { entryId, nextDayId } = await entry();
    const results = await Promise.all([
      patch(entryId, { dayId: nextDayId }),
      patch(entryId, { amount: 7 }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await costs().findById(entryId).lean()).toMatchObject({
      dayId: new Types.ObjectId(nextDayId),
      amount: 7,
    });
    const removed = await Promise.all([del(entryId), del(entryId)]);
    expect(removed.map((result) => result.status).sort()).toEqual([200, 404]);
  });
  it.each(['create', 'update', 'delete'])(
    'rolls back parent and entry writes when %s fails',
    async (operation) => {
      const { id, dayId, entryId } = await entry();
      const before = JSON.stringify(await parents().findById(id).lean()),
        old = JSON.stringify(await costs().findById(entryId).lean());
      const fail = () => {
        throw new Error('Injected database failure');
      };
      if (operation === 'create')
        jest.spyOn(costs(), 'create').mockImplementationOnce(fail);
      else if (operation === 'update')
        jest.spyOn(costs().prototype, 'save').mockImplementationOnce(fail);
      else jest.spyOn(costs(), 'deleteOne').mockImplementationOnce(fail);
      const action =
        operation === 'create'
          ? service.create(owner.toString(), id, { ...fields, dayId })
          : operation === 'update'
            ? service.update(owner.toString(), entryId, { amount: 99 })
            : service.remove(owner.toString(), entryId);
      await expect(action).rejects.toThrow('Injected database failure');
      expect(JSON.stringify(await parents().findById(id).lean())).toBe(before);
      expect(JSON.stringify(await costs().findById(entryId).lean())).toBe(old);
      expect(await costs().countDocuments({ dayId })).toBe(1);
    },
  );
  it('rolls back an inserted entry if transaction commit definitely fails', async () => {
    const { id, dayId } = await seed(),
      before = await parents().findById(id).lean();
    const original = db.startSession.bind(db);
    jest.spyOn(db, 'startSession').mockImplementationOnce(async () => {
      const session = await original();
      jest
        .spyOn(session, 'commitTransaction')
        .mockRejectedValueOnce(new Error('Injected commit failure'));
      return session;
    });
    await expect(
      service.create(owner.toString(), id, { ...fields, dayId }),
    ).rejects.toThrow('Injected commit failure');
    expect(await parents().findById(id).lean()).toEqual(before);
    expect(await costs().countDocuments({ dayId })).toBe(0);
  });
  it('returns 409 after bounded transient conflicts with no partial writes', async () => {
    const { id, entryId } = await entry(),
      before = await parents().findById(id).lean();
    const error = Object.assign(new Error('Conflict'), {
      hasErrorLabel: (label: string) => label === 'TransientTransactionError',
    });
    const spy = jest
      .spyOn(parents(), 'findOneAndUpdate')
      .mockImplementation(() => {
        throw error;
      });
    await patch(entryId, { amount: 99 }).expect(409);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(await parents().findById(id).lean()).toEqual(before);
    expect((await costs().findById(entryId))!.amount).toBe(fields.amount);
  });
  it.each(['create', 'update', 'reassign-target'])(
    'rejects %s after coordinated day deletion wins the parent lock',
    async (operation) => {
      const { id, dayId, nextDayId, entryId } = await entry();
      const deletedDay = operation === 'reassign-target' ? nextDayId : dayId;
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
      const deletion = db.transaction(async (session) => {
        await parents().updateOne(
          { _id: id },
          { $inc: { __v: 1 } },
          { session },
        );
        entered();
        await gate;
        await costs().deleteMany({ dayId: deletedDay }, { session });
        await days().deleteOne({ _id: deletedDay }, { session });
      });
      await ready;
      try {
        const mutation = (
          operation === 'create'
            ? post(id, { ...fields, dayId })
            : patch(
                entryId,
                operation === 'update' ? { amount: 99 } : { dayId: nextDayId },
              )
        ).then((result) => result);
        await new Promise((resolve) => setTimeout(resolve, 30));
        release();
        const [result] = await Promise.all([mutation, deletion]);
        expect(result.status).toBe(404);
        expect(await costs().countDocuments({ dayId: deletedDay })).toBe(0);
        if (operation === 'reassign-target')
          expect(await costs().findById(entryId).lean()).toMatchObject({
            dayId: new Types.ObjectId(dayId),
            amount: fields.amount,
          });
      } finally {
        release();
      }
    },
  );
  it('preserves a moved cost when its original day is deleted, and preserves other expense records', async () => {
    const { id, dayId, nextDayId, entryId } = await entry();
    await db
      .model('BudgetEntry')
      .create({
        dayId: nextDayId,
        category: 'FOOD',
        amount: 9,
        currency: 'EUR',
      });
    await db
      .model('Activity')
      .create({
        dayId: nextDayId,
        name: 'Visit',
        description: 'Museum',
        cost: 2,
        currency: 'USD',
      });
    const preservedBudget = await db
        .model('BudgetEntry')
        .find({ dayId: nextDayId })
        .lean(),
      preservedActivity = await db
        .model('Activity')
        .find({ dayId: nextDayId })
        .lean();
    await patch(entryId, { dayId: nextDayId }).expect(200);
    await db.transaction(async (session) => {
      await parents().updateOne({ _id: id }, { $inc: { __v: 1 } }, { session });
      await costs().deleteMany({ dayId }, { session });
      await days().deleteOne({ _id: dayId }, { session });
    });
    expect(await costs().findById(entryId).lean()).toMatchObject({
      dayId: new Types.ObjectId(nextDayId),
      amount: fields.amount,
    });
    expect(
      await db.model('BudgetEntry').find({ dayId: nextDayId }).lean(),
    ).toEqual(preservedBudget);
    expect(
      await db.model('Activity').find({ dayId: nextDayId }).lean(),
    ).toEqual(preservedActivity);
  });
  it('does not orphan entries during develop whole-itinerary deletion', async () => {
    for (let n = 0; n < 5; n++) {
      const { id, dayId } = await seed();
      const results = await Promise.allSettled([
        service.create(owner.toString(), id, { ...fields, dayId }),
        itineraries.remove(owner.toString(), id),
      ]);
      expect(results[1].status).toBe('fulfilled');
      if (results[0].status === 'rejected')
        expect(results[0].reason).toMatchObject({ status: 404 });
      expect(await costs().countDocuments({ dayId })).toBe(0);
    }
  });
  it('preserves ITN-01/03/05 contracts and documents the three official routes', async () => {
    const created = await request(http())
      .post('/api/itineraries')
      .set('Cookie', auth)
      .send({
        title: 'Regression',
        countryIds: ['EG'],
        startDate: '2028-01-01',
      })
      .expect(201);
    const id = created.body._id;
    const day = await request(http())
      .post(`/api/itineraries/${id}/days`)
      .set('Cookie', auth)
      .send({ cityId: 'cairo' })
      .expect(201);
    await request(http())
      .patch(`/api/itineraries/${id}/days/${day.body._id}`)
      .set('Cookie', auth)
      .send({ notes: 'Preserved' })
      .expect(200);
    const detail = await request(http())
      .get(`/api/itineraries/${id}`)
      .set('Cookie', auth)
      .expect(200);
    expect(detail.body.dayCount).toBe(1);
    const list = await request(http())
      .get('/api/itineraries?page=1')
      .set('Cookie', auth)
      .expect(200);
    expect(list.body.pageSize).toBe(10);
    await request(http())
      .delete(`/api/itineraries/${id}`)
      .set('Cookie', auth)
      .expect(200);
    const doc = SwaggerModule.createDocument(app, createSwaggerConfig());
    expect(
      doc.paths['/api/itineraries/{id}/transport-costs'].post!.responses,
    ).toHaveProperty('201');
    for (const verb of ['patch', 'delete'] as const) {
      const operation = doc.paths['/api/transport-costs/{id}'][verb]!;
      for (const code of [
        '200',
        '400',
        '401',
        '403',
        '404',
        '409',
        '500',
        '503',
      ])
        expect(operation.responses).toHaveProperty(code);
      expect(operation.security).toEqual(
        expect.arrayContaining([{ access_token: [] }]),
      );
    }
  });
});
