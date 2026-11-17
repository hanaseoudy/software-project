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
import { createSwaggerConfig } from '../src/common/swagger.config';
import { Itinerary } from '../src/itineraries/schemas/itinerary.schema';
import { ItineraryDay } from '../src/itineraries/schemas/itinerary-day.schema';
import { Activity } from '../src/itineraries/schemas/activity.schema';
import { BudgetCategory, BudgetEntry } from '../src/itineraries/schemas/budget-entry.schema';
import { IntercityTransportMode, TransportCost } from '../src/itineraries/schemas/transport-cost.schema';

// setup-e2e.ts refuses remote databases before any module is imported.
// Start a disposable local replica set, then run:
// TEST_MONGODB_URI=mongodb://127.0.0.1:27177 npm run test:e2e -- --runInBand itineraries
// Future reorder/expense writers must use the same parent-write protocol.
describe('ITN-07 against an isolated local replica set', () => {
  let app: INestApplication;
  let db: Connection;
  let service: ItinerariesService;
  let owner: string;
  let auth: string[];
  let otherAuth: string[];
  const oid = () => new Types.ObjectId();
  const models = () => ({ parent: db.model<Itinerary>('Itinerary'), day: db.model<ItineraryDay>('ItineraryDay'), activity: db.model<Activity>('Activity'), budget: db.model<BudgetEntry>('BudgetEntry'), transport: db.model<TransportCost>('TransportCost') });
  const login = async (email: string) => {
    const password = 'TestPassword123';
    await request(app.getHttpServer()).post('/api/auth/register').send({ firstName: 'Test', lastName: 'User', email, password, acceptTerms: true }).expect(201);
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
    return (response.headers['set-cookie'] as unknown as string[]).map(cookie => cookie.split(';')[0]);
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      MongooseModule.forRoot(process.env.MONGODB_URI!), ItinerariesModule,
    ] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser()); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Connection>(getConnectionToken());
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
    expect((await db.db!.admin().command({ hello: 1 })).setName).toBeTruthy();
    for (const model of Object.values(db.models)) await model.init();
    service = app.get(ItinerariesService);
    await db.model('City').create({ cityId: 'CAI', name: 'Cairo', countryCode: 'EG' });
    await db.model('Country').create({ code: 'EG', name: 'Egypt', currency: 'EGP' });
    auth = await login('itn07-owner@example.com');
    otherAuth = await login('itn07-other@example.com');
    owner = (await db.model('User').findOne({ email: 'itn07-owner@example.com' }))!._id.toString();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    try {
      if (db && db.name === process.env.E2E_DATABASE_NAME && /^travel_e2e_[a-f0-9]{32}$/.test(db.name)) await db.dropDatabase();
    } finally {
      if (app) await app.close();
      const directory = process.env.UPLOADS_DIR;
      if (directory && path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('travel-uploads-e2e-')) await rm(directory, { recursive: true, force: true });
    }
  });
  async function seed(count: number, expenses = false) {
    const m = models();
    const itinerary = await m.parent.create({ userId: owner, title: 'ITN-07', countryIds: ['EG'], startDate: new Date('2028-02-28T00:00:00Z') });
    const days = count ? await m.day.create(Array.from({ length: count }, (_, i) => ({ itineraryId: itinerary._id, dayNumber: i + 1, cityId: 'CAI', notes: `original-${i + 1}` }))) : [];
    if (expenses) for (const day of days) {
      await m.activity.create({ dayId: day._id, name: 'Museum', description: 'Ticket', cost: 0.1, currency: 'USD' });
      await m.budget.create({ dayId: day._id, category: BudgetCategory.ACTIVITIES, amount: 0.2, currency: 'USD' });
      await m.transport.create({ dayId: day._id, fromCityId: 'CAI', toCityId: 'BER', mode: IntercityTransportMode.FLIGHT, amount: 7, currency: 'EUR' });
    }
    return { id: itinerary._id.toString(), days };
  }
  const del = (id: string, dayId: string, cookies = auth) => request(app.getHttpServer()).delete(`/api/itineraries/${id}/days/${dayId}`).set('Cookie', cookies);
  async function numbered(id: string) {
    const days = await models().day.find({ itineraryId: id }).sort({ dayNumber: 1 }).lean();
    expect(days.map(day => day.dayNumber)).toEqual(days.map((_, index) => index + 1));
    expect(days.length).toBeLessThanOrEqual(60);
    return days;
  }
  async function snapshot(id: string) {
    const days = await models().day.find({ itineraryId: id }).sort({ _id: 1 }).lean();
    const dayIds = days.map(day => day._id);
    const data: unknown[] = [await models().parent.findById(id).lean(), days];
    for (const collection of [models().activity.collection, models().budget.collection, models().transport.collection]) data.push(await collection.find({ dayId: { $in: dayIds } }).sort({ _id: 1 }).toArray());
    return JSON.stringify(data);
  }
  it.each([['first', 4, 0], ['middle', 4, 1], ['last', 4, 3], ['only', 1, 0]] as const)('deletes %s day, preserves IDs/links and recalculates dates/totals', async (_, count, index) => {
    const { id, days } = await seed(count, true);
    const target = days[index]._id.toString();
    const result = await del(id, target).expect(200);
    const survivors = days.filter((_, i) => i !== index);
    expect(result.body.days.map((day: { _id: string }) => day._id)).toEqual(survivors.map(day => day._id.toString()));
    expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'].slice(0, count - 1));
    expect(result.body.budgetTotals).toEqual(count === 1 ? [] : [{ currency: 'EUR', total: 7 * (count - 1) }, { currency: 'USD', total: 0.3 * (count - 1) }].map(total => ({ ...total, total: Number(total.total.toFixed(2)) })));
    for (const collection of [models().activity.collection, models().budget.collection, models().transport.collection]) {
      expect(await collection.countDocuments({ dayId: new Types.ObjectId(target) })).toBe(0);
      expect(await collection.countDocuments({ dayId: { $in: survivors.map(day => day._id) } })).toBe(count - 1);
    }
    await numbered(id);
  });
  it('rejects malformed and missing IDs, empty itineraries, foreign days and repeat deletion', async () => {
    const a = await seed(2), b = await seed(1), empty = await seed(0);
    await del('bad', a.days[0]._id.toString()).expect(400);
    await del(a.id, 'bad').expect(400);
    await del(oid().toString(), oid().toString()).expect(404);
    await del(a.id, oid().toString()).expect(404);
    await del(empty.id, oid().toString()).expect(404);
    await del(a.id, b.days[0]._id.toString()).expect(404);
    await del(a.id, a.days[0]._id.toString()).expect(200);
    await del(a.id, a.days[0]._id.toString()).expect(404);
    expect(await models().day.countDocuments({ itineraryId: b.id })).toBe(1);
  });
  it('uses the real authentication guard and hides another owner\'s itinerary', async () => {
    const { id, days } = await seed(1);
    await request(app.getHttpServer()).delete(`/api/itineraries/${id}/days/${days[0]._id}`).expect(401);
    await del(id, days[0]._id.toString(), otherAuth).expect(404);
    expect(await models().day.countDocuments({ itineraryId: id })).toBe(1);
  });
  it.each(['activity', 'budget', 'transport', 'dayDelete', 'renumber', 'totals'])('rolls back every collection when %s fails', async stage => {
    const { id, days } = await seed(4, true);
    const before = await snapshot(id), m = models();
    const fail = () => { throw new Error('Injected database failure'); };
    if (stage === 'dayDelete') jest.spyOn(m.day, 'deleteOne').mockImplementationOnce(fail);
    else if (stage === 'renumber') jest.spyOn(m.day, 'updateOne').mockImplementationOnce(fail);
    else if (stage === 'totals') jest.spyOn(m.day, 'aggregate').mockImplementationOnce(fail);
    else jest.spyOn(m[stage as 'activity' | 'budget' | 'transport'], 'deleteMany').mockImplementationOnce(fail);
    await expect(service.removeDay(owner, id, days[1]._id.toString())).rejects.toThrow('Injected database failure');
    expect(await snapshot(id)).toBe(before);
  });
  it('rolls back a real E11000 failure without removing dependent data', async () => {
    const { id, days } = await seed(4, true), before = await snapshot(id), model = models().day;
    const original = model.updateOne.bind(model);
    jest.spyOn(model, 'updateOne').mockImplementationOnce((filter, _update, options) => original(filter, { $set: { dayNumber: 1 } }, options));
    await expect(service.removeDay(owner, id, days[1]._id.toString())).rejects.toMatchObject({ code: 11000 });
    expect(await snapshot(id)).toBe(before);
  });
  it.each(['create-delete', 'delete-delete', 'same-delete', 'patch-delete'])('preserves numbering under concurrent %s requests', async kind => {
    for (let trial = 0; trial < 5; trial++) {
      const { id, days } = await seed(4);
      const first = del(id, days[1]._id.toString());
      const second = kind === 'create-delete' ? request(app.getHttpServer()).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'CAI' }) :
        kind === 'patch-delete' ? request(app.getHttpServer()).patch(`/api/itineraries/${id}/days/${days[2]._id}`).set('Cookie', auth).send({ notes: 'edited', dayNumber: 60 }) :
        del(id, days[kind === 'same-delete' ? 1 : 2]._id.toString());
      const results = await Promise.all([first, second]);
      if (kind === 'same-delete') expect(results.map(result => result.status).sort()).toEqual([200, 404]);
      else expect(results.map(result => result.status)).toEqual([200, kind === 'create-delete' ? 201 : 200]);
      const remaining = await numbered(id);
      expect(remaining.length).toBe(kind === 'create-delete' ? 4 : kind === 'delete-delete' ? 2 : 3);
      if (kind === 'patch-delete') expect(remaining.find(day => day._id.toString() === days[2]._id.toString())).toMatchObject({ notes: 'edited', dayNumber: 2 });
    }
  });
  it('forces create/delete overlap while the deletion holds the parent write', async () => {
    const { id, days } = await seed(4), model = models().activity;
    const original = model.deleteMany.bind(model);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    jest.spyOn(model, 'deleteMany').mockImplementationOnce(((...args: Parameters<typeof original>) => {
      const result = original(...args);
      return (async () => { await result; entered(); await gate; return { acknowledged: true, deletedCount: 0 }; })() as never;
    }));
    const deletion = service.removeDay(owner, id, days[1]._id.toString());
    await ready;
    try {
      const creation = service.addDay(owner, id, { cityId: 'CAI' });
      await new Promise(resolve => setTimeout(resolve, 30)); release();
      await Promise.all([deletion, creation]);
      expect((await numbered(id)).length).toBe(4);
    } finally { release(); }
  });
  it('enforces 60 days under concurrent creates, then allows creation after deletion', async () => {
    const { id, days } = await seed(59);
    const results = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'CAI' })));
    expect(results.map(result => result.status).sort()).toEqual([201, 400]);
    expect((await numbered(id)).length).toBe(60);
    await del(id, days[0]._id.toString()).expect(200);
    await request(app.getHttpServer()).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'CAI' }).expect(201);
    expect((await numbered(id)).length).toBe(60);
  });
  it('coordinates whole-itinerary deletion with creation without orphaning days', async () => {
    const { id, days } = await seed(3, true);
    const results = await Promise.all([
      request(app.getHttpServer()).delete(`/api/itineraries/${id}`).set('Cookie', auth),
      request(app.getHttpServer()).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'CAI' }),
    ]);
    expect(results[0].status).toBe(200); expect([201, 404]).toContain(results[1].status);
    expect(await models().day.countDocuments({ itineraryId: id })).toBe(0);
    for (const collection of [models().activity.collection, models().budget.collection, models().transport.collection]) expect(await collection.countDocuments({ dayId: { $in: days.map(day => day._id) } })).toBe(0);
  });
  it('handles year boundaries, zero/optional costs and excludes other itineraries', async () => {
    const { id, days } = await seed(4);
    await models().parent.updateOne({ _id: id }, { $set: { startDate: new Date('2028-12-31T00:00:00Z') } });
    await seed(1, true);
    await models().activity.create({ dayId: days[2]._id, name: 'Free', description: 'No cost' });
    await models().activity.create({ dayId: days[2]._id, name: 'Zero', description: 'Zero cost', cost: 0, currency: 'USD' });
    const result = await del(id, days[0]._id.toString()).expect(200);
    expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-12-31', '2029-01-01', '2029-01-02']);
    expect(result.body.budgetTotals).toEqual([{ currency: 'USD', total: 0 }]);
  });
  it('rolls back when a surviving activity has a cost without a currency', async () => {
    const { id, days } = await seed(2);
    await models().activity.create({ dayId: days[1]._id, name: 'Incomplete', description: 'Missing currency', cost: 5 });
    const before = await snapshot(id);
    await del(id, days[0]._id.toString()).expect(409);
    expect(await snapshot(id)).toBe(before);
  });
  it('preserves the 60-day limit during concurrent create/delete at capacity', async () => {
    const { id, days } = await seed(60);
    const results = await Promise.all([
      del(id, days[1]._id.toString()),
      request(app.getHttpServer()).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'CAI' }),
    ]);
    expect(results[0].status).toBe(200); expect([201, 400]).toContain(results[1].status);
    expect((await numbered(id)).length).toBe(results[1].status === 201 ? 60 : 59);
  });
  it('preserves ITN-01 CRUD, ITN-03 pagination/counts/details and ITN-05 updates', async () => {
    const created = await request(app.getHttpServer()).post('/api/itineraries').set('Cookie', auth).send({ title: 'Regression', countryIds: ['EG'], startDate: '2028-12-31' }).expect(201);
    const id = created.body._id;
    const day = await request(app.getHttpServer()).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'CAI' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/itineraries/${id}/days/${day.body._id}`).set('Cookie', auth).send({ notes: 'updated' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/itineraries/${id}`).set('Cookie', auth).send({ title: 'Changed' }).expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/itineraries/${id}`).set('Cookie', auth).expect(200);
    expect(detail.body).toMatchObject({ title: 'Changed', dayCount: 1, days: [{ date: '2028-12-31', notes: 'updated' }] });
    const list = await request(app.getHttpServer()).get('/api/itineraries?page=1').set('Cookie', auth).expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 10 });
    expect(list.body.items.find((item: { id: string }) => item.id === id)).toMatchObject({ dayCount: 1 });
    await request(app.getHttpServer()).get(`/api/itineraries/${id}/days`).set('Cookie', auth).expect(200);
    await request(app.getHttpServer()).delete(`/api/itineraries/${id}`).set('Cookie', otherAuth).expect(403);
    await request(app.getHttpServer()).delete(`/api/itineraries/${id}`).set('Cookie', auth).expect(200);
  });
  it('returns HTTP 409 after bounded transient conflicts without partial writes', async () => {
    const { id, days } = await seed(3, true), before = await snapshot(id);
    const error = Object.assign(new Error('Write conflict'), { hasErrorLabel: (label: string) => label === 'TransientTransactionError' });
    const spy = jest.spyOn(models().parent, 'findOneAndUpdate').mockImplementation(() => { throw error; });
    await del(id, days[1]._id.toString()).expect(409);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(await snapshot(id)).toBe(before);
  });
  it('keeps the unique index and documents endpoint errors and cookie authentication', async () => {
    expect((await models().day.collection.indexes()).find(index => index.name === 'itineraryId_1_dayNumber_1')?.unique).toBe(true);
    const document = SwaggerModule.createDocument(app, createSwaggerConfig());
    const operation = document.paths['/api/itineraries/{id}/days/{dayId}'].delete!;
    for (const status of ['200', '400', '401', '404', '409', '500', '503']) expect(operation.responses).toHaveProperty(status);
    expect(operation.security).toEqual(expect.arrayContaining([{ access_token: [] }]));
  });
});
