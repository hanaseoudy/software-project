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
import { ActivitiesService } from '../src/itineraries/activities.service';
import { ItinerariesService } from '../src/itineraries/itineraries.service';
import { Activity } from '../src/itineraries/schemas/activity.schema';
import { Itinerary } from '../src/itineraries/schemas/itinerary.schema';
import { ItineraryDay } from '../src/itineraries/schemas/itinerary-day.schema';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { createSwaggerConfig } from '../src/common/swagger.config';

// setup-e2e.ts refuses Atlas/remote URLs. Requires a disposable local replica set:
// $env:TEST_MONGODB_URI='mongodb://127.0.0.1:27177'
// $env:NODE_OPTIONS='--experimental-vm-modules'
// npm run test:e2e -- --runInBand activities
// Coordinated day deletion below is explicitly a protocol fixture, not an
// ITN-07 implementation or claim that develop already has day deletion.
describe('ITN-10 activities on an isolated local replica set', () => {
  let app: INestApplication,
    db: Connection,
    service: ActivitiesService,
    itineraries: ItinerariesService;
  let auth: string[], other: string[], owner: Types.ObjectId;
  const oid = () => new Types.ObjectId().toString();
  const activityModel = () => db.model<Activity>('Activity');
  const parentModel = () => db.model<Itinerary>('Itinerary');
  const dayModel = () => db.model<ItineraryDay>('ItineraryDay');
  const valid = { name: ' Museum ', description: ' Visit the museum ' };
  const http = () => app.getHttpServer();
  const create = (
    id: string,
    dayId: string,
    body: object = valid,
    cookies = auth,
  ) =>
    request(http())
      .post(`/api/itineraries/${id}/days/${dayId}/activities`)
      .set('Cookie', cookies)
      .send(body);
  const patch = (id: string, body: object, cookies = auth) =>
    request(http())
      .patch(`/api/activities/${id}`)
      .set('Cookie', cookies)
      .send(body);
  const del = (id: string, cookies = auth) =>
    request(http()).delete(`/api/activities/${id}`).set('Cookie', cookies);
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
    const response = await request(http())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return (response.headers['set-cookie'] as unknown as string[]).map(
      (cookie) => cookie.split(';')[0],
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
    await db
      .model('City')
      .create({ cityId: 'CAI', name: 'Cairo', countryCode: 'EG' });
    auth = await login('activity-owner@example.com');
    other = await login('activity-other@example.com');
    owner = (await db
      .model('User')
      .findOne({ email: 'activity-owner@example.com' }))!._id;
    service = app.get(ActivitiesService);
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
  async function seed() {
    const parent = await parentModel().create({
      userId: owner,
      title: 'Activities',
      countryIds: ['EG'],
      startDate: new Date('2028-01-01T00:00:00Z'),
    });
    const day = await dayModel().create({
      itineraryId: parent._id,
      dayNumber: 1,
      cityId: 'CAI',
    });
    return { id: parent._id.toString(), dayId: day._id.toString() };
  }
  it('creates, partially updates and deletes only the selected activity', async () => {
    const { id, dayId } = await seed();
    const first = await create(id, dayId, {
      ...valid,
      time: '23:59',
      cost: 0,
      currency: 'usd',
    }).expect(201);
    const second = await create(id, dayId).expect(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      dayId,
      name: 'Museum',
      description: 'Visit the museum',
      time: '23:59',
      cost: 0,
      currency: 'USD',
      images: [],
    });
    const updated = await patch(first.body.id, {
      description: 'Updated',
    }).expect(200);
    expect(updated.body).toMatchObject({
      name: 'Museum',
      description: 'Updated',
      cost: 0,
      currency: 'USD',
    });
    await del(first.body.id).expect(200);
    expect(await dayModel().exists({ _id: dayId })).toBeTruthy();
    expect(await activityModel().exists({ _id: second.body.id })).toBeTruthy();
    await patch(first.body.id, { name: 'Again' }).expect(404);
    await del(first.body.id).expect(404);
  });
  it('clears time/cost with null, removes currency and preserves images', async () => {
    const { id, dayId } = await seed();
    const result = await create(id, dayId, {
      ...valid,
      time: '00:00',
      cost: 12.5,
      currency: 'USD',
    }).expect(201);
    await activityModel().updateOne(
      { _id: result.body.id },
      { $set: { images: ['/uploads/existing.png'] } },
    );
    await patch(result.body.id, { currency: 'EUR' })
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({ cost: 12.5, currency: 'EUR' }),
      );
    const cleared = await patch(result.body.id, {
      time: null,
      cost: null,
    }).expect(200);
    expect(cleared.body).not.toHaveProperty('time');
    expect(cleared.body).not.toHaveProperty('cost');
    expect(cleared.body).not.toHaveProperty('currency');
    expect(cleared.body.images).toEqual(['/uploads/existing.png']);
    const stored = await activityModel().findById(result.body.id).lean();
    expect(stored).not.toHaveProperty('time');
    expect(stored).not.toHaveProperty('cost');
    expect(stored).not.toHaveProperty('currency');
    await patch(result.body.id, { currency: 'USD' }).expect(400);
    await patch(result.body.id, { cost: 0 }).expect(400);
    await patch(result.body.id, { cost: 0, currency: 'USD' }).expect(200);
  });
  it('accepts omitted/null optional fields and long text without invented limits', async () => {
    const { id, dayId } = await seed();
    const result = await create(id, dayId, {
      name: 'x'.repeat(5000),
      description: 'y'.repeat(5000),
      time: null,
      cost: null,
    }).expect(201);
    expect(result.body.name.length).toBe(5000);
    expect(result.body).not.toHaveProperty('cost');
    expect(result.body).not.toHaveProperty('__v');
    expect(result.body).not.toHaveProperty('_id');
  });
  it.each([
    { name: undefined },
    { description: undefined },
    { name: '  ' },
    { description: '' },
    { name: null },
    { description: null },
    { name: 1 },
    { description: {} },
    { time: '25:99' },
    { time: '14:30\n' },
    { time: '1:00' },
    { time: 1000 },
    { cost: -1 },
    { cost: '1.2' },
    { cost: 1.234, currency: 'USD' },
    { cost: 0 },
    { cost: 1, currency: 'ZZZ' },
    { cost: 0, currency: null },
    { currency: 'USD' },
    { images: [] },
    { dayId: 'other' },
    { userId: 'other' },
  ])('rejects invalid POST fields: %j', async (fields) => {
    const { id, dayId } = await seed();
    const result = await create(id, dayId, { ...valid, ...fields }).expect(400);
    expect(result.body.message).toBe('Validation failed');
    expect(await activityModel().countDocuments({ dayId })).toBe(0);
  });
  it.each([
    {},
    { name: null },
    { description: null },
    { currency: null },
    { time: '24:00' },
    { cost: -1 },
    { cost: '3' },
    { cost: 0.001 },
    { currency: 'ZZZ' },
    { images: [] },
    { dayId: 'other' },
  ])('rejects invalid PATCH without changing activity: %j', async (fields) => {
    const { id, dayId } = await seed();
    const created = await create(id, dayId, {
      ...valid,
      cost: 2,
      currency: 'USD',
    }).expect(201);
    await patch(created.body.id, fields).expect(400);
    expect(
      await activityModel().findById(created.body.id).lean(),
    ).toMatchObject({ name: 'Museum', cost: 2, currency: 'USD' });
  });
  it('validates IDs, parent membership, missing resources and real authentication', async () => {
    const a = await seed(),
      b = await seed();
    await create('bad', a.dayId).expect(400);
    await create(a.id, 'bad').expect(400);
    await create(oid(), a.dayId).expect(404);
    await create(a.id, oid()).expect(404);
    await create(a.id, b.dayId).expect(404);
    await patch('bad', { name: 'x' }).expect(400);
    await del('bad').expect(400);
    await patch(oid(), { name: 'x' }).expect(404);
    await del(oid()).expect(404);
    const item = await create(a.id, a.dayId).expect(201);
    await request(http())
      .post(`/api/itineraries/${a.id}/days/${a.dayId}/activities`)
      .send(valid)
      .expect(401);
    await request(http())
      .patch(`/api/activities/${item.body.id}`)
      .send({ name: 'x' })
      .expect(401);
    await request(http()).delete(`/api/activities/${item.body.id}`).expect(401);
    await create(a.id, a.dayId, valid, other).expect(404);
    await patch(item.body.id, { name: 'Stolen' }, other).expect(404);
    await del(item.body.id, other).expect(404);
  });
  it('returns 404 for an activity whose day has disappeared', async () => {
    const { id, dayId } = await seed(),
      item = await create(id, dayId).expect(201);
    await dayModel().deleteOne({ _id: dayId });
    await patch(item.body.id, { name: 'x' }).expect(404);
    await del(item.body.id).expect(404);
  });
  it('rolls back the parent write when activity creation fails', async () => {
    const { id, dayId } = await seed(),
      before = await parentModel().findById(id).lean();
    jest.spyOn(activityModel(), 'create').mockImplementationOnce(() => {
      throw new Error('Injected failure');
    });
    await expect(
      service.create(owner.toString(), id, dayId, valid),
    ).rejects.toThrow('Injected failure');
    expect(await parentModel().findById(id).lean()).toEqual(before);
    expect(await activityModel().countDocuments({ dayId })).toBe(0);
  });
  it('rolls back update/delete failures and hides raw database exceptions over HTTP', async () => {
    const { id, dayId } = await seed(),
      item = await create(id, dayId).expect(201);
    const before = await parentModel().findById(id).lean();
    jest.spyOn(activityModel().prototype, 'save').mockImplementationOnce(() => {
      throw new Error('private database details');
    });
    const failed = await patch(item.body.id, { name: 'Changed' }).expect(500);
    expect(JSON.stringify(failed.body)).not.toContain(
      'private database details',
    );
    expect(await parentModel().findById(id).lean()).toEqual(before);
    expect((await activityModel().findById(item.body.id))!.name).toBe('Museum');
    jest.spyOn(activityModel(), 'deleteOne').mockImplementationOnce(() => {
      throw new Error('Injected delete failure');
    });
    await expect(
      service.remove(owner.toString(), item.body.id),
    ).rejects.toThrow('Injected delete failure');
    expect(await parentModel().findById(id).lean()).toEqual(before);
    expect(await activityModel().exists({ _id: item.body.id })).toBeTruthy();
  });
  it('serializes concurrent partial updates and concurrent deletions', async () => {
    const { id, dayId } = await seed(),
      item = await create(id, dayId).expect(201);
    const results = await Promise.all([
      patch(item.body.id, { name: 'New name' }),
      patch(item.body.id, { description: 'New description' }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await activityModel().findById(item.body.id).lean()).toMatchObject({
      name: 'New name',
      description: 'New description',
    });
    const deleted = await Promise.all([del(item.body.id), del(item.body.id)]);
    expect(deleted.map((result) => result.status).sort()).toEqual([200, 404]);
  });
  it.each(['create', 'update'])(
    'rejects %s after a coordinated parent-day deletion wins the lock',
    async (operation) => {
      const { id, dayId } = await seed(),
        item = await create(id, dayId).expect(201);
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
      const deletion = db.transaction(async (session) => {
        await parentModel().updateOne(
          { _id: id },
          { $inc: { __v: 1 } },
          { session },
        );
        entered();
        await gate;
        await activityModel().deleteMany({ dayId }, { session });
        await dayModel().deleteOne({ _id: dayId }, { session });
      });
      await ready;
      try {
        const mutation = (
          operation === 'create'
            ? create(id, dayId)
            : patch(item.body.id, { name: 'Too late' })
        ).then((result) => result);
        await new Promise((resolve) => setTimeout(resolve, 30));
        release();
        const [result] = await Promise.all([mutation, deletion]);
        expect(result.status).toBe(404);
        expect(await activityModel().countDocuments({ dayId })).toBe(0);
      } finally {
        release();
      }
    },
  );
  it('does not orphan activities during develop whole-itinerary deletion', async () => {
    for (let i = 0; i < 5; i++) {
      const { id, dayId } = await seed();
      const results = await Promise.allSettled([
        service.create(owner.toString(), id, dayId, valid),
        itineraries.remove(owner.toString(), id),
      ]);
      expect(results[1].status).toBe('fulfilled');
      if (results[0].status === 'rejected')
        expect(results[0].reason).toMatchObject({ status: 404 });
      expect(await activityModel().countDocuments({ dayId })).toBe(0);
    }
  });
  it('preserves ITN-01/03/05 routes and documents official activity endpoints', async () => {
    const response = await request(http())
      .post('/api/itineraries')
      .set('Cookie', auth)
      .send({
        title: 'Regression',
        countryIds: ['EG'],
        startDate: '2028-01-01',
      })
      .expect(201);
    const id = response.body._id;
    const day = await request(http())
      .post(`/api/itineraries/${id}/days`)
      .set('Cookie', auth)
      .send({ cityId: 'CAI' })
      .expect(201);
    await request(http())
      .patch(`/api/itineraries/${id}/days/${day.body._id}`)
      .set('Cookie', auth)
      .send({ notes: 'Preserved' })
      .expect(200);
    const details = await request(http())
      .get(`/api/itineraries/${id}`)
      .set('Cookie', auth)
      .expect(200);
    expect(details.body.dayCount).toBe(1);
    await request(http())
      .get('/api/itineraries?page=1')
      .set('Cookie', auth)
      .expect(200);
    await request(http())
      .delete(`/api/itineraries/${id}`)
      .set('Cookie', auth)
      .expect(200);
    const doc = SwaggerModule.createDocument(app, createSwaggerConfig());
    expect(
      doc.paths['/api/itineraries/{id}/days/{dayId}/activities'].post!
        .responses,
    ).toHaveProperty('201');
    for (const verb of ['patch', 'delete'] as const) {
      const operation = doc.paths['/api/activities/{id}'][verb]!;
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
