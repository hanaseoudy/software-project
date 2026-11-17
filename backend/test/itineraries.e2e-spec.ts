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
      MongooseModule.forRoot(process.env.MONGODB_URI!, { monitorCommands: true }), ItinerariesModule,
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
    await db.model('City').create({ cityId: 'GIZ', name: 'Giza', countryCode: 'EG' });
    await db.collection('currencies').insertMany(['EGP', 'EUR', 'USD'].map(code => ({ code })));
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

  describe('ITN-09 consecutive-city groups and native-currency subtotals', () => {
    const getGroups = (id: string, cookies = auth) => request(app.getHttpServer()).get(`/api/itineraries/${id}/groups`).set('Cookie', cookies);
    async function seedCities(cityIds: string[], expenses = false) {
      const data = await seed(cityIds.length, expenses);
      for (let i = 0; i < cityIds.length; i++) await models().day.updateOne({ _id: data.days[i]._id }, { $set: { cityId: cityIds[i] } });
      return data;
    }
    it.each([
      { cities: ['CAI', 'CAI', 'GIZ', 'GIZ', 'CAI', 'CAI'], counts: [2, 2, 2] },
      { cities: ['CAI', 'GIZ', 'CAI', 'GIZ'], counts: [1, 1, 1, 1] },
      { cities: ['CAI', 'CAI', 'CAI'], counts: [3] },
      { cities: ['CAI'], counts: [1] },
      { cities: [], counts: [] },
    ])('groups $cities with correct membership, boundaries and metadata-free responses', async ({ cities, counts }) => {
      const { id, days } = await seedCities(cities);
      const before = await snapshot(id);
      const response = await getGroups(id).expect(200);
      expect(response.body.itineraryId).toBe(id);
      expect(response.body.groups.map((group: { dayCount: number }) => group.dayCount)).toEqual(counts);
      expect(response.body.groups.flatMap((group: { dayIds: string[] }) => group.dayIds)).toEqual(days.map(day => day._id.toString()));
      let first = 0;
      for (const group of response.body.groups) {
        expect(group.firstDay).toMatchObject({ id: days[first]._id.toString(), dayNumber: first + 1 });
        expect(group.lastDay).toMatchObject({ id: days[first + group.dayCount - 1]._id.toString(), dayNumber: first + group.dayCount });
        expect(group.city).toEqual({ cityId: cities[first], name: cities[first] === 'CAI' ? 'Cairo' : 'Giza', countryCode: 'EG' });
        expect(group.budgetSubtotals).toEqual([]);
        expect(Object.keys(group).sort()).toEqual(['budgetSubtotals', 'city', 'dayCount', 'dayIds', 'firstDay', 'lastDay']);
        expect(Object.keys(group.firstDay).sort()).toEqual(['date', 'dayNumber', 'id']);
        first += group.dayCount;
      }
      expect(await snapshot(id)).toBe(before);
    });
    it('orders by dayNumber rather than insertion order and derives leap/year dates', async () => {
      const { id } = await seed(0), m = models();
      const records = await m.day.create([3, 1, 2].map(dayNumber => ({ itineraryId: id, dayNumber, cityId: dayNumber === 3 ? 'GIZ' : 'CAI' })));
      const response = await getGroups(id).expect(200);
      expect(response.body.groups[0].dayIds).toEqual([records[1]._id.toString(), records[2]._id.toString()]);
      expect(response.body.groups[0].firstDay.date).toBe('2028-02-28');
      expect(response.body.groups[0].lastDay.date).toBe('2028-02-29');
      expect(response.body.groups[1].firstDay.date).toBe('2028-03-01');
      await m.parent.updateOne({ _id: id }, { $set: { startDate: new Date('2028-12-31T00:00:00Z') } });
      const next = await getGroups(id).expect(200);
      expect(next.body.groups[0].lastDay.date).toBe('2029-01-01');
      expect(next.body.groups[1].firstDay.date).toBe('2029-01-02');
    });
    it('reflects day creation and city edits while preserving existing detail/day contracts', async () => {
      const { id, days } = await seedCities(['CAI']);
      const server = app.getHttpServer();
      const second = await request(server).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'GIZ' }).expect(201);
      expect((await getGroups(id).expect(200)).body.groups.map((group: { dayCount: number }) => group.dayCount)).toEqual([1, 1]);
      await request(server).patch(`/api/itineraries/${id}/days/${second.body._id}`).set('Cookie', auth).send({ cityId: 'CAI' }).expect(200);
      const merged = await getGroups(id).expect(200);
      expect(merged.body.groups[0].dayIds).toEqual([days[0]._id.toString(), second.body._id]);
      expect(merged.body.groups).toHaveLength(1);
      await request(server).patch(`/api/itineraries/${id}/days/${second.body._id}`).set('Cookie', auth).send({ cityId: null }).expect(400);
      await request(server).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({}).expect(400);
      await request(server).post(`/api/itineraries/${id}/days`).set('Cookie', auth).send({ cityId: 'UNKNOWN' }).expect(400);
      const detail = await request(server).get(`/api/itineraries/${id}`).set('Cookie', auth).expect(200);
      expect(detail.body).not.toHaveProperty('groups');
      const listed = await request(server).get(`/api/itineraries/${id}/days`).set('Cookie', auth).expect(200);
      expect(Array.isArray(listed.body)).toBe(true);
      expect(listed.body).toHaveLength(2);
    });
    it('merges groups after ITN-07 deletion and reconciles all surviving totals', async () => {
      const { id, days } = await seedCities(['CAI', 'GIZ', 'CAI'], true);
      expect((await getGroups(id).expect(200)).body.groups).toHaveLength(3);
      const deleted = await del(id, days[1]._id.toString()).expect(200);
      const result = await getGroups(id).expect(200);
      expect(result.body.groups).toHaveLength(1);
      expect(result.body.groups[0].dayIds).toEqual([days[0]._id.toString(), days[2]._id.toString()]);
      expect(result.body.groups[0].budgetSubtotals).toEqual(deleted.body.budgetTotals);
      expect(result.body.groups[0].budgetSubtotals).toEqual([{ currency: 'EUR', total: 14 }, { currency: 'USD', total: 0.6 }]);
    });
    it('uses persisted reordered fixtures without copying unmerged ITN-08 code', async () => {
      const { id, days } = await seedCities(['CAI', 'GIZ', 'CAI'], true);
      const beforeExpenses = [];
      for (const model of [models().activity, models().budget, models().transport]) beforeExpenses.push(JSON.stringify(await model.collection.find({ dayId: { $in: days.map(day => day._id) } }).sort({ _id: 1 }).toArray()));
      // Test fixture only: atomically install a valid alternate persisted order.
      // No reorder route, algorithm or service is imported into this branch.
      const session = await db.startSession();
      try {
        await session.withTransaction(async () => {
          await models().day.updateOne({ _id: days[2]._id }, { $set: { dayNumber: 4 } }, { session });
          await models().day.updateOne({ _id: days[1]._id }, { $set: { dayNumber: 3 } }, { session });
          await models().day.updateOne({ _id: days[2]._id }, { $set: { dayNumber: 2 } }, { session });
        });
      } finally { await session.endSession(); }
      const result = await getGroups(id).expect(200);
      expect(result.body.groups.map((group: { dayCount: number }) => group.dayCount)).toEqual([2, 1]);
      expect(result.body.groups[0].dayIds).toEqual([days[0]._id.toString(), days[2]._id.toString()]);
      expect(result.body.groups[0].lastDay.date).toBe('2028-02-29');
      let index = 0;
      for (const model of [models().activity, models().budget, models().transport]) expect(JSON.stringify(await model.collection.find({ dayId: { $in: days.map(day => day._id) } }).sort({ _id: 1 }).toArray())).toBe(beforeExpenses[index++]);
    });
    it('sums all three sources exactly once with decimal arithmetic and separate group/currency totals', async () => {
      const { id, days } = await seedCities(['CAI', 'GIZ', 'CAI']), m = models();
      for (const cost of [0.1, 0.2, 0.1, 0.1]) await m.activity.create({ dayId: days[0]._id, name: 'Ticket', description: 'Separate stored record', cost, currency: 'USD' });
      for (const amount of [0.3, 0.4]) await m.budget.create({ dayId: days[0]._id, category: BudgetCategory.ACTIVITIES, amount, currency: 'USD' });
      for (const amount of [0.5, 0.6]) await m.transport.create({ dayId: days[0]._id, fromCityId: 'CAI', toCityId: 'GIZ', mode: IntercityTransportMode.BUS, amount, currency: 'USD' });
      await m.activity.create({ dayId: days[0]._id, name: 'Euro ticket', description: 'Ticket', cost: 2, currency: 'EUR' });
      await m.budget.create({ dayId: days[2]._id, category: BudgetCategory.FOOD, amount: 8, currency: 'EGP' });
      await seed(1, true); // Another itinerary must not contribute any costs.
      const before = await snapshot(id);
      const result = await getGroups(id).expect(200);
      expect(result.body.groups.map((group: { budgetSubtotals: unknown[] }) => group.budgetSubtotals)).toEqual([
        [{ currency: 'EUR', total: 2 }, { currency: 'USD', total: 2.3 }], [], [{ currency: 'EGP', total: 8 }],
      ]);
      expect(await snapshot(id)).toBe(before);
    });
    it('preserves zero entries and excludes costless activities, including explicit null costs', async () => {
      const { id, days } = await seed(1), m = models();
      await m.activity.create({ dayId: days[0]._id, name: 'Walk', description: 'No cost' });
      await m.activity.collection.insertOne({ dayId: days[0]._id, name: 'Null cost', cost: null } as never);
      expect((await getGroups(id).expect(200)).body.groups[0].budgetSubtotals).toEqual([]);
      await m.activity.create({ dayId: days[0]._id, name: 'Free', description: 'Explicit zero', cost: 0, currency: 'USD' });
      await m.budget.create({ dayId: days[0]._id, category: BudgetCategory.FOOD, amount: 0, currency: 'EGP' });
      await m.transport.create({ dayId: days[0]._id, fromCityId: 'CAI', toCityId: 'GIZ', mode: IntercityTransportMode.BUS, amount: 0, currency: 'EUR' });
      expect((await getGroups(id).expect(200)).body.groups[0].budgetSubtotals).toEqual([
        { currency: 'EGP', total: 0 }, { currency: 'EUR', total: 0 }, { currency: 'USD', total: 0 },
      ]);
    });
    it('requires authentication, ownership and valid/existing itinerary IDs', async () => {
      const { id } = await seed(1), before = await snapshot(id);
      await request(app.getHttpServer()).get(`/api/itineraries/${id}/groups`).expect(401);
      await request(app.getHttpServer()).get(`/api/itineraries/${id}/groups`).set('Cookie', 'access_token=invalid').expect(401);
      await getGroups(id, otherAuth).expect(404);
      await getGroups('bad').expect(400);
      await getGroups(oid().toString()).expect(404);
      await getGroups(id.toUpperCase()).expect(200);
      expect(await snapshot(id)).toBe(before);
    });
    it.each(['missing-city', 'unknown-city', 'blank-city', 'gap', 'fraction'])('rejects existing %s data without modifying it', async kind => {
      const { id, days } = await seed(2);
      if (kind === 'missing-city') await models().day.collection.updateOne({ _id: days[0]._id }, { $unset: { cityId: '' } });
      else await models().day.collection.updateOne({ _id: days[1]._id }, { $set: kind === 'gap' ? { dayNumber: 3 } : kind === 'fraction' ? { dayNumber: 1.5 } : { cityId: kind === 'blank-city' ? ' ' : 'UNKNOWN' } });
      const before = await snapshot(id);
      await getGroups(id).expect(409);
      expect(await snapshot(id)).toBe(before);
    });
    it('preserves the unique index and rejects actual duplicate day numbers', async () => {
      const { id, days } = await seed(2);
      await expect(models().day.collection.updateOne({ _id: days[1]._id }, { $set: { dayNumber: 1 } })).rejects.toMatchObject({ code: 11000 });
      expect((await models().day.collection.indexes()).find(index => index.name === 'itineraryId_1_dayNumber_1')?.unique).toBe(true);
      expect((await getGroups(id).expect(200)).body.groups[0].dayCount).toBe(2);
    });
    it.each(['activity', 'budget', 'transport'] as const)('rejects missing or unsupported currency in %s instead of omitting that source', async source => {
      const { id, days } = await seed(1, true), model = models()[source];
      await model.collection.updateOne({ dayId: days[0]._id }, { $unset: { currency: '' } });
      await getGroups(id).expect(409);
      await model.collection.updateOne({ dayId: days[0]._id }, { $set: { currency: 'BTC' } });
      await getGroups(id).expect(409);
    });
    it.each(['activity', 'budget', 'transport'] as const)('rejects malformed amounts from %s without partial subtotals', async source => {
      for (const value of ['12', -1, NaN, Infinity, {}, []]) {
        const { id, days } = await seed(1), model = models()[source];
        await model.collection.insertOne({ dayId: days[0]._id, [source === 'activity' ? 'cost' : 'amount']: value, currency: 'USD' } as never);
        await getGroups(id).expect(409);
      }
    });
    it.each(['budget', 'transport'] as const)('rejects missing required monetary amounts in %s', async source => {
      const { id, days } = await seed(1);
      await models()[source].collection.insertOne({ dayId: days[0]._id, currency: 'USD' } as never);
      await getGroups(id).expect(409);
    });
    it('uses the same wire-level snapshot for all four database reads and closes it', async () => {
      const { id } = await seed(2, true);
      const commands: { lsid: unknown; readConcern: { level: string; atClusterTime?: unknown }; txnNumber?: unknown; startTransaction?: unknown }[] = [];
      const listener = (event: { databaseName: string; commandName: string; command: typeof commands[number] }) => {
        if (event.databaseName === db.name && ['find', 'aggregate'].includes(event.commandName)) commands.push(event.command);
      };
      const start = db.startSession.bind(db);
      const sessions: Awaited<ReturnType<typeof start>>[] = [];
      jest.spyOn(db, 'startSession').mockImplementation(async options => {
        const session = await start(options); sessions.push(session); return session;
      });
      db.getClient().on('commandStarted', listener);
      try { await service.findGroups(owner, id); }
      finally { db.getClient().off('commandStarted', listener); }
      expect(commands).toHaveLength(4);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].snapshotEnabled).toBe(true);
      expect(sessions[0].hasEnded).toBe(true);
      for (const command of commands) {
        expect(command.readConcern.level).toBe('snapshot');
        expect(command.lsid).toEqual(commands[0].lsid);
        expect(command.txnNumber).toBeUndefined();
        expect(command.startTransaction).toBeUndefined();
      }
      for (const command of commands.slice(1)) expect(command.readConcern.atClusterTime).toEqual(sessions[0].snapshotTime);
    });
    it.each(['delete', 'city', 'activity', 'budget', 'transport', 'start-date'])('keeps a coherent snapshot across concurrent %s changes', async kind => {
      const { id, days } = await seedCities(['CAI', 'GIZ', 'CAI'], true), m = models();
      const expected = await service.findGroups(owner, id);
      const original = m.parent.findOne.bind(m.parent);
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      jest.spyOn(m.parent, 'findOne').mockImplementationOnce((...args) => {
        const query = original(...args);
        const exec = query.exec.bind(query);
        jest.spyOn(query, 'exec').mockImplementationOnce(async () => {
          const result = await exec(); entered(); await gate; return result;
        });
        return query;
      });
      const reading = service.findGroups(owner, id);
      await Promise.race([ready, reading.then(() => { throw new Error('Snapshot gate not reached'); })]);
      try {
        if (kind === 'delete') await service.removeDay(owner, id, days[1]._id.toString());
        else if (kind === 'city') await service.updateDay(owner, id, days[1]._id.toString(), { cityId: 'CAI' });
        else if (kind === 'start-date') await m.parent.updateOne({ _id: id }, { $set: { startDate: new Date('2029-12-31T00:00:00Z') } }, { writeConcern: { w: 'majority' } });
        else await m[kind as 'activity' | 'budget' | 'transport'].collection.updateOne({ dayId: days[0]._id }, { $set: { [kind === 'activity' ? 'cost' : 'amount']: 10 } }, { writeConcern: { w: 'majority' } });
        release();
        expect(await reading).toEqual(expected);
        const fresh = await service.findGroups(owner, id);
        expect(fresh).not.toEqual(expected);
        if (kind === 'delete' || kind === 'city') expect(fresh.groups).toHaveLength(1);
      } finally { release(); await reading.catch(() => undefined); }
    });
    it('releases failed snapshot sessions and returns errors instead of incomplete totals', async () => {
      const { id } = await seed(1, true), original = db.startSession.bind(db);
      const sessions: Awaited<ReturnType<typeof original>>[] = [];
      jest.spyOn(db, 'startSession').mockImplementation(async options => { const session = await original(options); sessions.push(session); return session; });
      jest.spyOn(models().day, 'aggregate').mockImplementationOnce(() => { throw Object.assign(new Error('Snapshot unavailable'), { code: 246 }); });
      await getGroups(id).expect(503);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].hasEnded).toBe(true);
      jest.spyOn(models().day, 'aggregate').mockImplementationOnce(() => { throw new Error('Required source could not be read'); });
      await getGroups(id).expect(500);
      expect(sessions).toHaveLength(2);
      expect(sessions[1].hasEnded).toBe(true);
    });
    it('documents the complete response and endpoint errors', () => {
      const document = SwaggerModule.createDocument(app, createSwaggerConfig());
      const operation = document.paths['/api/itineraries/{id}/groups'].get!;
      for (const status of ['200', '400', '401', '404', '409', '500', '503']) expect(operation.responses).toHaveProperty(status);
      expect(operation.security).toEqual(expect.arrayContaining([{ access_token: [] }]));
      expect(document.components!.schemas).toHaveProperty('ItineraryGroupsResponseDto');
      expect(document.components!.schemas!.ItineraryCityGroupDto).toMatchObject({ required: ['city', 'firstDay', 'lastDay', 'dayIds', 'dayCount', 'budgetSubtotals'] });
    });
  });

});
