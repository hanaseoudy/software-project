import { BudgetEntriesService } from '../src/itineraries/budget-entries.service';
import type { ItineraryBudgetTotalsResponseDto } from '../src/itineraries/dto/itinerary-budget-totals-response.dto';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import mongoose, { Connection, Types } from 'mongoose';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { SwaggerModule } from '@nestjs/swagger';
import { access, mkdir, mkdtemp, rm } from 'fs/promises';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { MongoClient } from 'mongodb';
import { tmpdir } from 'os';
import * as path from 'path';
import { ItinerariesModule } from '../src/itineraries/itineraries.module';
import { ItinerariesService } from '../src/itineraries/itineraries.service';
import { createSwaggerConfig } from '../src/common/swagger.config';
import { Itinerary, ItinerarySchema, ItineraryVisibility } from '../src/itineraries/schemas/itinerary.schema';
import { ItineraryDay, ItineraryDaySchema } from '../src/itineraries/schemas/itinerary-day.schema';
import { ActivitiesService } from '../src/itineraries/activities.service';
import { TransportCostsService } from '../src/itineraries/transport-costs.service';
import { PublicItinerariesController } from '../src/itineraries/public-itineraries.controller';
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
 
  describe('ITN-08 day reordering', () => {
    const move = (id: string, dayId: string, newPosition: unknown, cookies = auth) => request(app.getHttpServer())
      .patch(`/api/itineraries/${id}/days/${dayId}/reorder`).set('Cookie', cookies).send({ newPosition });
    const ids = (days: { _id: unknown }[]) => days.map(day => String(day._id));
    async function expenses(id: string) {
      const dayIds = (await models().day.find({ itineraryId: id }).lean()).map(day => day._id);
      const result: unknown[] = [];
      for (const collection of [models().activity.collection, models().budget.collection, models().transport.collection]) {
        result.push(await collection.find({ dayId: { $in: dayIds } }).sort({ _id: 1 }).toArray());
      }
      return JSON.stringify(result);
    }
    it.each([[3, 2, [0, 3, 1, 2]], [0, 4, [1, 2, 3, 0]], [2, 1, [2, 0, 1, 3]]] as const)('moves index %s to %s, preserving IDs, cities and every expense', async (index, position, order) => {
      const { id, days } = await seed(4, true);
      // Distinct cities make accidental reassignment visible. Raw fixtures do not
      // require adding unrelated reference-data records.
      await models().day.updateOne({ _id: days[index]._id }, { $set: { cityId: 'BER' } });
      const beforeDays = await models().day.find({ itineraryId: id }).lean();
      const beforeExpenses = await expenses(id);
      const parentBefore = await models().parent.findById(id).lean();
      const result = await move(id, days[index]._id.toString(), position).expect(200);
      expect(ids(result.body.days)).toEqual(order.map(i => days[i]._id.toString()));
      expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02']);
      expect(result.body).not.toHaveProperty('groups');
      expect(result.body).not.toHaveProperty('budgetTotals');
      for (const day of result.body.days) {
        const before = beforeDays.find(row => row._id.toString() === day._id)!;
        expect(day).toMatchObject({ cityId: before.cityId, notes: before.notes });
        expect(Object.keys(day).sort()).toEqual(['_id', 'cityId', 'date', 'dayNumber', 'itineraryId', 'notes']);
      }
      const parentAfter = await models().parent.findById(id).lean();
      const { __v: _beforeVersion, updatedAt: _beforeTime, ...beforeFields } = parentBefore as typeof parentBefore & { __v: number; updatedAt: Date };
      const { __v: _afterVersion, updatedAt: _afterTime, ...afterFields } = parentAfter as typeof parentAfter & { __v: number; updatedAt: Date };
      expect(afterFields).toEqual(beforeFields);
      expect(await expenses(id)).toBe(beforeExpenses);
      expect(ids(await numbered(id))).toEqual(ids(result.body.days));
      const detail = await request(app.getHttpServer()).get(`/api/itineraries/${id}`).set('Cookie', auth).expect(200);
      expect(detail.body.days.map((day: { id: string }) => day.id)).toEqual(ids(result.body.days));
      expect(detail.body.days.map((day: { date: string }) => day.date)).toEqual(result.body.days.map((day: { date: string }) => day.date));
    });
    it.each([1, 4])('keeps day documents untouched for a no-op with %s days', async count => {
      const { id, days } = await seed(count, true);
      const beforeDays = JSON.stringify(await models().day.find({ itineraryId: id }).sort({ _id: 1 }).lean());
      const beforeExpenses = await expenses(id);
      await move(id, days[0]._id.toString(), 1).expect(200);
      expect(JSON.stringify(await models().day.find({ itineraryId: id }).sort({ _id: 1 }).lean())).toBe(beforeDays);
      expect(await expenses(id)).toBe(beforeExpenses);
    });
    it('uses temporary 61 at capacity without committing it', async () => {
      const { id, days } = await seed(60), model = models().day;
      const original = model.updateOne.bind(model);
      let sawTemporary = false;
      jest.spyOn(model, 'updateOne').mockImplementation((filter, update, options) => {
        if ((update as { $set?: { dayNumber?: number } }).$set?.dayNumber === 61) sawTemporary = true;
        return original(filter, update, options);
      });
      await move(id, days[59]._id.toString(), 1).expect(200);
      expect(sawTemporary).toBe(true);
      expect(ids(await numbered(id))).toEqual([days[59], ...days.slice(0, 59)].map(day => day._id.toString()));
      expect(await model.countDocuments({ itineraryId: id, dayNumber: { $gt: 60 } })).toBe(0);
      // Exercise the other direction through the full range, too.
      await move(id, days[59]._id.toString(), 60).expect(200);
      expect(ids(await numbered(id))).toEqual(ids(days));
    });
    it('derives UTC dates across a year boundary', async () => {
      const { id, days } = await seed(3);
      await models().parent.updateOne({ _id: id }, { $set: { startDate: new Date('2028-12-31T00:00:00Z') } });
      const result = await move(id, days[2]._id.toString(), 1).expect(200);
      expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-12-31', '2029-01-01', '2029-01-02']);
    });
    it.each([undefined, null, '2', true, 0, -1, 1.5, 5, 61])('rejects invalid position %s without changes', async position => {
      const { id, days } = await seed(4), before = await snapshot(id);
      await move(id, days[0]._id.toString(), position).expect(400);
      expect(await snapshot(id)).toBe(before);
    });
    it('accepts uppercase hexadecimal itinerary and day IDs', async () => {
      const { id, days } = await seed(2);
      const result = await move(id.toUpperCase(), days[1]._id.toString().toUpperCase(), 1).expect(200);
      expect(ids(result.body.days)).toEqual([days[1]._id.toString(), days[0]._id.toString()]);
    });
    it('rejects invalid IDs, missing/foreign days and empty itineraries', async () => {
      const a = await seed(2), b = await seed(1), empty = await seed(0);
      const before = await snapshot(a.id);
      await move('bad', a.days[0]._id.toString(), 1).expect(400);
      await move(a.id, 'bad', 1).expect(400);
      await move(oid().toString(), oid().toString(), 1).expect(404);
      await move(a.id, oid().toString(), 1).expect(404);
      await move(a.id, b.days[0]._id.toString(), 1).expect(404);
      await move(empty.id, oid().toString(), 1).expect(404);
      expect(await snapshot(a.id)).toBe(before);
      expect(await models().day.countDocuments({ itineraryId: b.id })).toBe(1);
    });
    it('requires real JWT authentication and itinerary ownership', async () => {
      const { id, days } = await seed(2), before = await snapshot(id);
      await request(app.getHttpServer()).patch(`/api/itineraries/${id}/days/${days[0]._id}/reorder`).send({ newPosition: 2 }).expect(401);
      await move(id, days[0]._id.toString(), 2, otherAuth).expect(404);
      expect(await snapshot(id)).toBe(before);
    });
    it('refuses inconsistent pre-existing numbering', async () => {
      const { id, days } = await seed(4);
      await models().day.updateOne({ _id: days[3]._id }, { $set: { dayNumber: 5 } });
      const before = await snapshot(id);
      await move(id, days[0]._id.toString(), 2).expect(409);
      expect(await snapshot(id)).toBe(before);
    });
    it.each([1, 2, 4])('rolls back after completed write %s, including parent and expenses', async failAt => {
      const { id, days } = await seed(4, true), before = await snapshot(id), model = models().day;
      const original = model.updateOne.bind(model);
      let writes = 0;
      jest.spyOn(model, 'updateOne').mockImplementation((filter, update, options) => (async () => {
        const result = await original(filter, update, options);
        if (++writes === failAt) throw new Error('Injected reorder failure');
        return result;
      })() as never);
      await expect(service.reorderDay(owner, id, days[3]._id.toString(), { newPosition: 2 })).rejects.toThrow('Injected reorder failure');
      expect(await snapshot(id)).toBe(before);
      expect(await models().day.countDocuments({ itineraryId: id, dayNumber: { $gt: 4 } })).toBe(0);
    });
    it('rolls back parking and all associations after a real unique-index conflict', async () => {
      const { id, days } = await seed(4, true), before = await snapshot(id), model = models().day;
      const original = model.updateOne.bind(model);
      let writes = 0;
      jest.spyOn(model, 'updateOne').mockImplementation((filter, update, options) =>
        original(filter, ++writes === 2 ? { $set: { dayNumber: 1 } } : update, options));
      await expect(service.reorderDay(owner, id, days[3]._id.toString(), { newPosition: 2 })).rejects.toMatchObject({ code: 11000 });
      expect(await snapshot(id)).toBe(before);
      expect((await model.collection.indexes()).find(index => index.name === 'itineraryId_1_dayNumber_1')?.unique).toBe(true);
    });
    it('serializes simultaneous reorders without losing either move', async () => {
      for (let trial = 0; trial < 3; trial++) {
        const { id, days } = await seed(4);
        const results = await Promise.all([
          move(id, days[3]._id.toString(), 2), move(id, days[0]._id.toString(), 4),
        ]);
        expect(results.map(result => result.status)).toEqual([200, 200]);
        const final = ids(await numbered(id));
        const validOrders = [[3, 1, 2, 0], [1, 3, 2, 0]].map(order => order.map(i => days[i]._id.toString()));
        expect(validOrders).toContainEqual(final);
      }
    });
    it.each(['reorder', 'create', 'delete', 'delete-target'])('forces overlap with %s while reorder holds the parent write', async kind => {
      const { id, days } = await seed(4, true), model = models().day;
      const original = model.updateOne.bind(model);
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { entered = resolve; });
      jest.spyOn(model, 'updateOne').mockImplementationOnce((filter, update, options) => (async () => {
        const result = await original(filter, update, options);
        entered(); await gate; return result;
      })() as never);
      const first = service.reorderDay(owner, id, days[3]._id.toString(), { newPosition: 2 });
      // Ensure a failure before parking cannot leave this test waiting forever.
      await Promise.race([ready, first.then(() => { throw new Error('Reorder completed without reaching gate'); })]);
      try {
        // Outside readers cannot see the parked number.
        expect(ids(await numbered(id))).toEqual(ids(days));
        const second = kind === 'reorder' ? service.reorderDay(owner, id, days[0]._id.toString(), { newPosition: 4 }) :
          kind === 'create' ? service.addDay(owner, id, { cityId: 'CAI' }) :
          service.removeDay(owner, id, days[kind === 'delete-target' ? 3 : 1]._id.toString());
        const completion = Promise.all([first, second]);
        await new Promise(resolve => setTimeout(resolve, 30));
        release(); await completion;
        const final = await numbered(id);
        const expected = kind === 'reorder' ? [3, 1, 2, 0] : kind === 'create' ? [0, 3, 1, 2] : kind === 'delete' ? [0, 3, 2] : [0, 1, 2];
        expect(ids(final).slice(0, expected.length)).toEqual(expected.map(i => days[i]._id.toString()));
        expect(final.length).toBe(kind === 'create' ? 5 : kind === 'reorder' ? 4 : 3);
        expect(await model.countDocuments({ itineraryId: id, dayNumber: { $gt: final.length } })).toBe(0);
      } finally { release(); }
    });
    it('returns 404 when deletion wins before reordering the same day', async () => {
      const { id, days } = await seed(3);
      await del(id, days[2]._id.toString()).expect(200);
      const before = await snapshot(id);
      await move(id, days[2]._id.toString(), 1).expect(404);
      expect(await snapshot(id)).toBe(before);
    });
    it('documents validation, errors, authentication and deferred grouping', () => {
      const document = SwaggerModule.createDocument(app, createSwaggerConfig());
      const operation = document.paths['/api/itineraries/{id}/days/{dayId}/reorder'].patch!;
      for (const status of ['200', '400', '401', '404', '409', '500', '503']) expect(operation.responses).toHaveProperty(status);
      expect(operation.security).toEqual(expect.arrayContaining([{ access_token: [] }]));
      expect(operation.description).toContain('ITN-09');
      expect(document.components!.schemas!.ReorderItineraryDayDto).toMatchObject({
        required: ['newPosition'], properties: { newPosition: { type: 'integer', minimum: 1, maximum: 60 } },
      });
    });
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
 

  describe('ITN-20 owner visibility and public reads', () => {
    const tracked = new Set<string>();
    const http = () => app.getHttpServer();
    const search = (query = '') => request(http()).get('/api/itineraries/public/search' + query);
    const detail = (id: string) => request(http()).get('/api/itineraries/public/' + id);
    const visibility = (id: string, value: unknown, cookies = auth) => request(http()).patch('/api/itineraries/' + id).set('Cookie', cookies).send({ visibility: value });
    async function fixture(count = 2, expenses = false) {
      const data = await seed(count, expenses); tracked.add(data.id); return data;
    }
    afterEach(async () => {
      if (tracked.size) await models().parent.updateMany({ _id: { $in: [...tracked].map(id => new Types.ObjectId(id)) } }, { $set: { visibility: ItineraryVisibility.PRIVATE } });
      tracked.clear();
    });
    it('creates Private itineraries even when creation supplies visibility and preserves omitted PATCH behavior', async () => {
      const created = await request(http()).post('/api/itineraries').set('Cookie', auth).send({ title: 'Private default', countryIds: ['EG'], startDate: '2028-02-28', visibility: 'PUBLIC' }).expect(201);
      const id = created.body._id; tracked.add(id);
      expect(created.body.visibility).toBe('PRIVATE');
      await detail(id).expect(404);
      await request(http()).patch('/api/itineraries/' + id).set('Cookie', auth).send({ title: 'Ordinary edit' }).expect(200);
      expect((await models().parent.findById(id).lean())!.visibility).toBe('PRIVATE');
      expect((await search().expect(200)).body.items).not.toContainEqual(expect.objectContaining({ id }));
    });
    it.each(['missing', 'null'])('treats legacy %s visibility as Private in owner reads and rejects public reads', async kind => {
      const { id } = await fixture();
      await models().parent.collection.updateOne({ _id: new Types.ObjectId(id) }, kind === 'missing' ? { $unset: { visibility: '' } } : { $set: { visibility: null } });
      const own = await request(http()).get('/api/itineraries/' + id).set('Cookie', auth).expect(200);
      expect(own.body.visibility).toBe('PRIVATE');
      const ordered = await models().parent.find({ userId: owner }).sort({ updatedAt: -1, _id: -1 }).lean();
      const page = Math.floor(ordered.findIndex(item => item._id.toString() === id) / 10) + 1;
      const listed = await service.findAll(owner, page);
      expect(listed.items.find(item => item.id === id)?.visibility).toBe('PRIVATE');
      await detail(id).expect(404);
      expect((await search().expect(200)).body.total).toBe(0);
      await visibility(id, 'PUBLIC').expect(200);
      await detail(id).expect(200);
      await visibility(id, 'PRIVATE').expect(200);
      expect((await models().parent.findById(id).lean())!.visibility).toBe('PRIVATE');
    });
    it('persists repeated transitions and revokes search/direct links immediately after each acknowledgement', async () => {
      const { id } = await fixture();
      for (const value of ['PUBLIC', 'PUBLIC', 'PRIVATE', 'PRIVATE', 'PUBLIC', 'PRIVATE']) {
        const changed = await visibility(id, value).expect(200);
        expect(changed.body.visibility).toBe(value);
        expect((await models().parent.findById(id).lean())!.visibility).toBe(value);
        const result = await search().expect(200);
        expect(result.headers['cache-control']).toBe('no-store');
        expect(result.body.total).toBe(value === 'PUBLIC' ? 1 : 0);
        await detail(id).expect(value === 'PUBLIC' ? 200 : 404);
      }
    });
    it.each([null, '', 'public', 'private', 'OTHER', 1, true, {}, []])('rejects invalid visibility %j without writes', async value => {
      const { id } = await fixture(), before = await snapshot(id);
      await visibility(id, value).expect(400);
      expect(await snapshot(id)).toBe(before);
    });
    it('validates IDs and authentication while preserving owner update status conventions', async () => {
      const { id } = await fixture(), before = await snapshot(id);
      await request(http()).patch('/api/itineraries/' + id).send({ visibility: 'PUBLIC' }).expect(401);
      await visibility(id, 'PUBLIC', otherAuth).expect(403);
      await visibility('bad', 'PUBLIC').expect(400);
      await visibility(oid().toString(), 'PUBLIC').expect(404);
      await detail('bad').expect(400);
      await detail(oid().toString()).expect(404);
      expect(await snapshot(id)).toBe(before);
    });
    it('allowlists public fields, preserves UTC order after real ITN-08 reordering, and protects conditional reads', async () => {
      const { id, days } = await fixture(4, true);
      await models().parent.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { privateMemo: 'secret', clonedFromId: oid(), originalAuthorName: 'Private attribution' } });
      await visibility(id, 'PUBLIC').expect(200);
      await request(http()).patch('/api/itineraries/' + id + '/days/' + days[3]._id + '/reorder').set('Cookie', auth).send({ newPosition: 2 }).expect(200);
      const before = await snapshot(id);
      const result = await detail(id).expect(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(Object.keys(result.body).sort()).toEqual(['countryIds', 'dayCount', 'days', 'id', 'startDate', 'title', 'visibility']);
      expect(result.body.days.map((day: { id: string }) => day.id)).toEqual([days[0], days[3], days[1], days[2]].map(day => day._id.toString()));
      expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02']);
      for (const day of result.body.days) expect(Object.keys(day).sort()).toEqual(['cityId', 'date', 'dayNumber', 'id']);
      expect(JSON.stringify(result.body)).not.toContain('secret');
      expect(await snapshot(id)).toBe(before);
      const etag = result.headers.etag ?? '"previous-response"';
      await detail(id).set('If-None-Match', etag).expect(200);
      await visibility(id, 'PRIVATE').expect(200);
      await detail(id).set('If-None-Match', etag).expect(404);
      await search().set('If-None-Match', '*').expect(200).expect(response => { expect(response.body.total).toBe(0); });
    });
    it('filters before pagination/counting and returns deterministic pages of ten', async () => {
      const ids: string[] = [], fixed = new Date('2028-01-01T00:00:00Z');
      for (let i = 0; i < 13; i++) {
        const { id } = await fixture(i % 3); ids.push(id);
        await models().parent.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { visibility: 'PUBLIC', updatedAt: fixed } });
      }
      const hidden = await fixture(), legacy = await fixture(), ordinary = await fixture();
      await models().parent.collection.updateOne({ _id: new Types.ObjectId(hidden.id) }, { $set: { visibility: 'PUBLIC', isHidden: true } });
      await models().parent.collection.updateOne({ _id: new Types.ObjectId(legacy.id) }, { $unset: { visibility: '' } });
      const first = await search('?page=1').expect(200), second = await search('?page=2').expect(200), third = await search('?page=3').expect(200);
      expect(first.body).toMatchObject({ total: 13, pageSize: 10, totalPages: 2 });
      expect(second.body).toMatchObject({ total: 13, page: 2, pageSize: 10, totalPages: 2 });
      expect(first.body.items).toHaveLength(10); expect(second.body.items).toHaveLength(3); expect(third.body.items).toEqual([]);
      expect([...first.body.items, ...second.body.items].map((item: { id: string }) => item.id)).toEqual(ids.sort().reverse());
      for (const item of [...first.body.items, ...second.body.items]) expect(Object.keys(item).sort()).toEqual(['countryIds', 'dayCount', 'id', 'startDate', 'title', 'visibility']);
      for (const id of [hidden.id, legacy.id, ordinary.id]) await detail(id).expect(404);
    });
    it.each(['?q=Egypt', '?cityId=CAI', '?minDays=1', '?visibility=PRIVATE', '?page=0', '?page=1.5', '?page=abc'])('rejects unsupported filters or invalid pagination %s', async query => {
      await search(query).expect(400);
    });
    it('preserves moderation hiding, owner identity and associated records during a mixed visibility PATCH', async () => {
      const { id, days } = await fixture(2, true), parent = models().parent;
      await parent.updateOne({ _id: id }, { $set: { isHidden: true } });
      const before = JSON.parse(await snapshot(id));
      const result = await request(http()).patch('/api/itineraries/' + id).set('Cookie', auth).send({ visibility: 'PUBLIC', title: 'New title', startDate: '2028-12-31', countryIds: ['EG'], isHidden: false, userId: oid().toString() }).expect(200);
      expect(result.body).toMatchObject({ visibility: 'PUBLIC', title: 'New title', isHidden: true, userId: owner });
      expect((await parent.findById(id).lean())!.__v).toBe(before[0].__v + 1);
      expect(JSON.parse(await snapshot(id)).slice(1)).toEqual(before.slice(1));
      expect((await numbered(id)).map(day => day._id.toString())).toEqual(days.map(day => day._id.toString()));
      await detail(id).expect(404);
      expect((await search().expect(200)).body.total).toBe(0);
    });
    it.each(['PUBLIC', 'PRIVATE'])('keeps all nonowner mutations and owner-only reads protected when %s', async value => {
      const { id, days } = await fixture(2, true), foreign = await fixture(1);
      await visibility(id, value).expect(200);
      const m = models(), activity = (await m.activity.findOne({ dayId: days[0]._id }))!, transport = (await m.transport.findOne({ dayId: days[0]._id }))!;
      const before = await snapshot(id), other = otherAuth;
      await request(http()).patch('/api/itineraries/' + id).set('Cookie', other).send({ title: 'Attack' }).expect(403);
      await request(http()).delete('/api/itineraries/' + id).set('Cookie', other).expect(403);
      await request(http()).post('/api/itineraries/' + id + '/days').set('Cookie', other).send({ cityId: 'CAI' }).expect(404);
      await request(http()).patch('/api/itineraries/' + id + '/days/' + days[0]._id).set('Cookie', other).send({ notes: 'Attack' }).expect(404);
      await request(http()).delete('/api/itineraries/' + id + '/days/' + days[0]._id).set('Cookie', other).expect(404);
      await request(http()).patch('/api/itineraries/' + id + '/days/' + days[0]._id + '/reorder').set('Cookie', other).send({ newPosition: 2 }).expect(404);
      await request(http()).post('/api/itineraries/' + id + '/days/' + days[0]._id + '/activities').set('Cookie', other).send({ name: 'Attack', description: 'No' }).expect(404);
      await request(http()).patch('/api/activities/' + activity._id).set('Cookie', other).send({ name: 'Attack' }).expect(404);
      await request(http()).delete('/api/activities/' + activity._id).set('Cookie', other).expect(404);
      const transportBody = { dayId: days[0]._id.toString(), mode: IntercityTransportMode.BUS, fromCityId: 'CAI', toCityId: 'GIZ', amount: 1, currency: 'USD' };
      await request(http()).post('/api/itineraries/' + id + '/transport-costs').set('Cookie', other).send(transportBody).expect(404);
      await request(http()).patch('/api/transport-costs/' + transport._id).set('Cookie', other).send({ amount: 1 }).expect(404);
      await request(http()).delete('/api/transport-costs/' + transport._id).set('Cookie', other).expect(404);
      for (const route of ['', '/days', '/groups']) await request(http()).get('/api/itineraries/' + id + route).set('Cookie', other).expect(404);
      await request(http()).get('/api/itineraries/' + id + '/groups').expect(401);
      await request(http()).post('/api/itineraries/' + id + '/days/' + foreign.days[0]._id + '/activities').set('Cookie', auth).send({ name: 'Cross', description: 'No' }).expect(404);
      await request(http()).patch('/api/transport-costs/' + transport._id).set('Cookie', auth).send({ dayId: foreign.days[0]._id.toString() }).expect(404);
      expect(await snapshot(id)).toBe(before);
    });
    it('removes deleted Public itineraries from public results', async () => {
      const { id } = await fixture(2, true);
      await visibility(id, 'PUBLIC').expect(200);
      expect((await search().expect(200)).body.total).toBe(1);
      await request(http()).delete('/api/itineraries/' + id).set('Cookie', auth).expect(200);
      await detail(id).expect(404);
      expect((await search().expect(200)).body.total).toBe(0);
    });
    it('verifies raw driver timestamps, primary reads and cleanup on the wire', async () => {
      const { id } = await fixture(); await visibility(id, 'PUBLIC').expect(200);
      const commands: { requestId: number; command: Record<string, any> }[] = [], replies = new Map<number, any>();
      const started = (event: { databaseName: string; commandName: string; requestId: number; command: Record<string, any> }) => { if (event.databaseName === db.name && ['find', 'aggregate'].includes(event.commandName)) commands.push(event); };
      const succeeded = (event: { requestId: number; reply: any }) => replies.set(event.requestId, event.reply);
      const client = db.getClient(), start = client.startSession.bind(client), sessions: ReturnType<typeof start>[] = [], run = db.db!.runCursorCommand.bind(db.db!), cursors: ReturnType<typeof run>[] = [];
      jest.spyOn(client, 'startSession').mockImplementation(options => { const session = start(options); sessions.push(session); return session; });
      jest.spyOn(db.db!, 'runCursorCommand').mockImplementation((command, options) => { const cursor = run(command, options); cursors.push(cursor); return cursor; });
      db.getClient().on('commandStarted', started); db.getClient().on('commandSucceeded', succeeded);
      try { await service.findPublicOne(id); }
      finally { db.getClient().off('commandStarted', started); db.getClient().off('commandSucceeded', succeeded); }
      expect(commands).toHaveLength(3);
      expect(commands.map(event => event.command.readConcern.level)).toEqual(['linearizable', 'snapshot', 'linearizable']);
      expect(commands[1].command.readConcern.atClusterTime).toEqual(replies.get(commands[0].requestId).operationTime);
      for (const event of commands) { expect(event.command.lsid).toEqual(commands[0].command.lsid); expect(event.command.startTransaction).toBeUndefined(); expect(event.command.readConcern.afterClusterTime).toBeUndefined(); }
      expect(sessions).toHaveLength(1); expect(sessions[0].hasEnded).toBe(true); expect(sessions[0].operationTime).toBeUndefined();
      expect(cursors).toHaveLength(1); expect(cursors[0].closed).toBe(true);
    });
    it('rejects an actual historical Public snapshot if revocation commits before the final recheck', async () => {
      const { id } = await fixture(); await visibility(id, 'PUBLIC').expect(200);
      const original = db.db!.runCursorCommand.bind(db.db!); let sawPublicSnapshot = false;
      jest.spyOn(db.db!, 'runCursorCommand').mockImplementationOnce((command, options) => {
        const cursor = original(command, options), read = cursor.toArray.bind(cursor);
        jest.spyOn(cursor, 'toArray').mockImplementationOnce(async () => { const rows = await read(); sawPublicSnapshot = rows[0]?.visibility === 'PUBLIC'; await service.update(owner, id, { visibility: ItineraryVisibility.PRIVATE }); return rows; });
        return cursor;
      });
      await detail(id).expect(404);
      expect(sawPublicSnapshot).toBe(true);
      await detail(id).expect(404);
      expect((await search().expect(200)).body.total).toBe(0);
    });
    it('anchors an overlapping search to its earlier valid barrier, then excludes revoked data on the next request', async () => {
      const { id } = await fixture(); await visibility(id, 'PUBLIC').expect(200);
      const command = db.db!.command.bind(db.db!);
      jest.spyOn(db.db!, 'command').mockImplementationOnce(async (...args) => {
        const reply = await command(...args);
        await service.update(owner, id, { visibility: ItineraryVisibility.PRIVATE });
        return reply;
      });
      const overlapping = await search().expect(200);
      expect(overlapping.body.items.map((item: { id: string }) => item.id)).toEqual([id]);
      expect(overlapping.body.total).toBe(1);
      expect((await search().expect(200)).body.total).toBe(0);
    });
    it.each(['reorder', 'delete', 'activity', 'transport'])('serializes visibility revocation with a real %s parent-write operation', async kind => {
      const { id, days } = await fixture(4, true), m = models(); await visibility(id, 'PUBLIC').expect(200);
      const beforeVersion = (await m.parent.findById(id).lean())!.__v;
      const original = m.parent.findOneAndUpdate.bind(m.parent);
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
      jest.spyOn(m.parent, 'findOneAndUpdate').mockImplementationOnce((...args) => {
        const query = original(...args), exec = query.exec.bind(query);
        jest.spyOn(query, 'exec').mockImplementationOnce(async () => { const result = await exec(); entered(); await gate; return result; }); return query;
      });
      const operation = kind === 'reorder' ? service.reorderDay(owner, id, days[3]._id.toString(), { newPosition: 2 }) : kind === 'delete' ? service.removeDay(owner, id, days[1]._id.toString()) : kind === 'activity' ? app.get(ActivitiesService).create(owner, id, days[0]._id.toString(), { name: 'During race', description: 'Keep owner-only' }) : app.get(TransportCostsService).create(owner, id, { dayId: days[0]._id.toString(), mode: IntercityTransportMode.BUS, fromCityId: 'CAI', toCityId: 'GIZ', amount: 1, currency: 'USD' });
      await Promise.race([ready, operation.then(() => { throw new Error('Gate not reached'); })]);
      try {
        const changing = service.update(owner, id, { visibility: ItineraryVisibility.PRIVATE });
        const completion = Promise.all([operation, changing]);
        await new Promise(resolve => setTimeout(resolve, 30)); release(); await completion;
        expect((await m.parent.findById(id).lean())!.__v).toBe(beforeVersion + 2);
        expect((await m.parent.findById(id).lean())!.visibility).toBe('PRIVATE');
        const final = await numbered(id); expect(final).toHaveLength(kind === 'delete' ? 3 : 4);
        if (kind === 'reorder') expect(final.map(day => day._id.toString())).toEqual([days[0], days[3], days[1], days[2]].map(day => day._id.toString()));
        await detail(id).expect(404); expect((await search().expect(200)).body.total).toBe(0);
      } finally { release(); await operation.catch(() => undefined); }
    });
    it('fails closed without a timestamp and ends sessions/cursors after driver errors', async () => {
      const { id } = await fixture(); await visibility(id, 'PUBLIC').expect(200);
      const client = db.getClient(), start = client.startSession.bind(client), sessions: ReturnType<typeof start>[] = [], command = db.db!.command.bind(db.db!);
      jest.spyOn(client, 'startSession').mockImplementation(options => { const session = start(options); sessions.push(session); return session; });
      jest.spyOn(db.db!, 'command').mockImplementationOnce(async (...args) => { const reply = await command(...args); delete reply.operationTime; return reply; });
      await detail(id).expect(503); expect(sessions[0].hasEnded).toBe(true);
      const run = db.db!.runCursorCommand.bind(db.db!); let failedCursor: ReturnType<typeof run> | undefined;
      jest.spyOn(db.db!, 'runCursorCommand').mockImplementationOnce((raw, options) => { failedCursor = run(raw, options); jest.spyOn(failedCursor, 'toArray').mockRejectedValueOnce(new Error('Private database details')); return failedCursor; });
      const result = await detail(id).expect(503);
      expect(JSON.stringify(result.body)).not.toContain('Private database details');
      expect(failedCursor!.closed).toBe(true); expect(sessions[1].hasEnded).toBe(true);
    });
    it('fails closed on real majority loss with bounded deadlines in a dedicated replica set', async () => {
      // This test owns its processes and never changes the replica set supplied
      // through TEST_MONGODB_URI. Existing binaries only; no downloads/install.
      const binary = process.env.ITN20_MONGOD_PATH;
      if (!binary) throw new Error('ITN-20 quorum test requires ITN20_MONGOD_PATH pointing to an existing mongod binary');
      await access(binary);
      const directory = await mkdtemp(path.join(tmpdir(), 'itn20-quorum-'));
      const children: ReturnType<typeof spawn>[] = [], exits: Promise<void>[] = [];
      let control: MongoClient | undefined, isolated: Connection | undefined, publicApp: INestApplication | undefined;
      const freePort = () => new Promise<number>((resolve, reject) => {
        const server = createServer(); server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') { server.close(); reject(new Error('No local test port')); return; }
          server.close(error => error ? reject(error) : resolve(address.port));
        });
      });
      try {
        const ports = [await freePort(), await freePort()];
        if (ports[0] === ports[1]) throw new Error('Local test ports must be distinct');
        const setName = path.basename(directory);
        for (let i = 0; i < 2; i++) {
          const data = path.join(directory, String(i)); await mkdir(data);
          const child = spawn(binary, ['--dbpath', data, '--port', String(ports[i]), '--bind_ip', '127.0.0.1', '--replSet', setName, '--logpath', path.join(data, 'mongod.log')], { windowsHide: true, stdio: 'ignore' });
          children.push(child); exits.push(new Promise(resolve => { child.once('exit', () => resolve()); child.once('error', () => resolve()); }));
        }
        for (let attempt = 0; attempt < 60; attempt++) {
          const candidate = new MongoClient('mongodb://127.0.0.1:' + ports[0] + '/?directConnection=true', { serverSelectionTimeoutMS: 100 });
          try { await candidate.connect(); control = candidate; break; }
          catch { await candidate.close(); await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        if (!control) throw new Error('Dedicated local quorum-test MongoDB did not start');
        await control.db('admin').command({ replSetInitiate: { _id: setName, members: [
          { _id: 0, host: '127.0.0.1:' + ports[0], priority: 2 },
          { _id: 1, host: '127.0.0.1:' + ports[1], priority: 0 },
        ], settings: { electionTimeoutMillis: 1000, heartbeatIntervalMillis: 500 } } });
        for (let attempt = 0; attempt < 200; attempt++) {
          if ((await control.db('admin').command({ hello: 1 })).isWritablePrimary) break;
          if (attempt === 199) throw new Error('Dedicated replica set did not elect a primary');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const uri = 'mongodb://127.0.0.1:' + ports[0] + ',127.0.0.1:' + ports[1] + '/travel_itn20_quorum?replicaSet=' + setName;
        isolated = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 });
        await isolated.asPromise();
        const parent = isolated.model(Itinerary.name, ItinerarySchema), day = isolated.model(ItineraryDay.name, ItineraryDaySchema);
        await parent.init(); await day.init();
        const id = oid();
        await parent.collection.insertOne({ _id: id, userId: oid(), title: 'Quorum fixture', countryIds: ['EG'], startDate: new Date('2028-02-28T00:00:00Z'), visibility: ItineraryVisibility.PUBLIC }, { writeConcern: { w: 'majority' } });
        const reader = new ItinerariesService(parent as never, {} as never, day as never, {} as never, {} as never, {} as never, isolated, {} as never);
        const module = await Test.createTestingModule({ controllers: [PublicItinerariesController], providers: [{ provide: ItinerariesService, useValue: reader }] }).compile();
        publicApp = module.createNestApplication(); publicApp.setGlobalPrefix('api');
        publicApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await publicApp.init();
        const server = publicApp.getHttpServer();
        await request(server).get('/api/itineraries/public/' + id).expect(200);
        await request(server).get('/api/itineraries/public/search').expect(200);
        // Two voters require both members for majority. Stop only this test's
        // secondary, then exercise the actual HTTP/controller/service commands.
        children[1].kill(); await exits[1];
        for (const route of ['/api/itineraries/public/' + id, '/api/itineraries/public/search']) {
          const started = Date.now();
          const result = await request(server).get(route).expect(503);
          expect(Date.now() - started).toBeLessThan(8000);
          expect(result.headers['cache-control']).toBe('no-store');
          expect(result.body).not.toHaveProperty('items');
          expect(result.body).not.toHaveProperty('days');
        }
      } finally {
        if (publicApp) await publicApp.close();
        if (isolated) await isolated.close();
        if (control) await control.close();
        for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
        await Promise.all(exits);
        const resolved = path.resolve(directory);
        if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('itn20-quorum-')) await rm(resolved, { recursive: true, force: true });
      }
    }, 60000);

    it('documents public allowlists, errors and unchanged mutation authentication', () => {
      const document = SwaggerModule.createDocument(app, createSwaggerConfig());
      const discovery = document.paths['/api/itineraries/public/search'].get!, direct = document.paths['/api/itineraries/public/{id}'].get!;
      for (const status of ['200', '400', '503']) expect(discovery.responses).toHaveProperty(status);
      for (const status of ['200', '400', '404', '503']) expect(direct.responses).toHaveProperty(status);
      expect(discovery.security ?? []).toEqual([]); expect(direct.security ?? []).toEqual([]);
      expect(document.paths['/api/itineraries/{id}'].patch!.security).toContainEqual({ access_token: [] });
      expect(document.components!.schemas!.UpdateItineraryDto).toMatchObject({ properties: { visibility: { enum: ['PRIVATE', 'PUBLIC'] } } });
    });
  });

  describe('ITN-14 daily budget entries and reconciled totals', () => {
    const createBudget = (id: string, dayId: string, body: unknown = { category: 'FOOD', amount: 0, currency: 'USD' }, cookies = auth) =>
      request(app.getHttpServer()).post('/api/itineraries/' + id + '/days/' + dayId + '/budgets').set('Cookie', cookies).send(body);
    const getTotals = (id: string, cookies = auth) => request(app.getHttpServer()).get('/api/itineraries/' + id + '/budget-summary').set('Cookie', cookies);
    const patchBudget = (entry: string, body: unknown, cookies = auth) => request(app.getHttpServer()).patch('/api/budgets/' + entry).set('Cookie', cookies).send(body);
    const deleteBudget = (entry: string, cookies = auth) => request(app.getHttpServer()).delete('/api/budgets/' + entry).set('Cookie', cookies);
    const listBudget = (id: string, dayId: string, cookies = auth) => request(app.getHttpServer()).get('/api/itineraries/' + id + '/days/' + dayId + '/budgets').set('Cookie', cookies);
    const money = (value: number) => BigInt(Math.round(value * 100));
    function reconcile(body: ItineraryBudgetTotalsResponseDto) {
      for (const total of body.totals) {
        expect(Object.values(total.byCategory).reduce((sum, value) => sum + money(value), 0n)).toBe(money(total.total));
        expect(body.days.flatMap(day => day.totals.filter(row => row.currency === total.currency)).reduce((sum, row) => sum + money(row.total), 0n)).toBe(money(total.total));
        for (const category of Object.keys(total.byCategory) as (keyof typeof total.byCategory)[])
          expect(body.days.flatMap(day => day.totals.filter(row => row.currency === total.currency)).reduce((sum, row) => sum + money(row.byCategory[category]), 0n)).toBe(money(total.byCategory[category]));
      }
      for (const day of body.days) for (const row of day.totals)
        expect(Object.values(row.byCategory).reduce((sum, value) => sum + money(value), 0n)).toBe(money(row.total));
    }
    it.each(Object.values(BudgetCategory))('creates and lists category %s with zero, stable IDs and clean metadata', async category => {
      const { id, days } = await seed(1);
      const result = await createBudget(id, days[0]._id.toString(), { category, amount: 0, currency: ' usd ', description: ' Lunch ' }).expect(201);
      expect(result.body).toEqual({ id: expect.any(String), dayId: days[0]._id.toString(), category, amount: 0, currency: 'USD', description: 'Lunch' });
      expect((await listBudget(id, days[0]._id.toString()).expect(200)).body).toEqual([result.body]);
      const totals = await getTotals(id).expect(200); reconcile(totals.body);
      expect(totals.body.totals[0].total).toBe(0);
    });
    it('edits and deletes only the selected entry; totals and ITN-09 subtotals recalculate', async () => {
      const { id, days } = await seed(2);
      const one = await createBudget(id, days[0]._id.toString(), { category: 'FOOD', amount: 1.25, currency: 'USD', description: 'Lunch' }).expect(201);
      const two = await createBudget(id, days[0]._id.toString(), { category: 'FOOD', amount: 2, currency: 'USD' }).expect(201);
      const updated = await patchBudget(one.body.id, { amount: 3.5, category: 'ACCOMMODATION', currency: 'eur' }).expect(200);
      expect(updated.body).toMatchObject({ id: one.body.id, dayId: days[0]._id.toString(), amount: 3.5, category: 'ACCOMMODATION', currency: 'EUR', description: 'Lunch' });
      let totals = await getTotals(id).expect(200); reconcile(totals.body);
      expect(totals.body.totals.map((row: { currency: string; total: number }) => [row.currency, row.total])).toEqual([['EUR', 3.5], ['USD', 2]]);
      expect((await service.findGroups(owner, id)).groups[0].budgetSubtotals).toEqual([{ currency: 'EUR', total: 3.5 }, { currency: 'USD', total: 2 }]);
      await deleteBudget(one.body.id).expect(200); await deleteBudget(one.body.id).expect(404);
      expect(await models().budget.findById(two.body.id)).not.toBeNull();
      totals = await getTotals(id).expect(200); reconcile(totals.body); expect(totals.body.totals).toHaveLength(1); expect(totals.body.totals[0].total).toBe(2);
      expect((await service.findGroups(owner, id)).groups[0].budgetSubtotals).toEqual([{ currency: 'USD', total: 2 }]);
    });
    it('counts all three independent sources exactly once and reconciles every category/day/currency', async () => {
      const { id, days } = await seed(3);
      for (const [day, category, amount, currency] of [[0, 'FOOD', 0.1, 'USD'], [0, 'ACTIVITIES', 0.2, 'USD'], [1, 'ACCOMMODATION', 1.03, 'USD'], [1, 'IN_CITY_TRANSPORT', 2.4, 'EUR'], [1, 'FOOD', 3.6, 'EUR']] as const)
        await createBudget(id, days[day]._id.toString(), { category, amount, currency }).expect(201);
      for (const cost of [0.3, 0.4]) await request(app.getHttpServer()).post('/api/itineraries/' + id + '/days/' + days[0]._id + '/activities').set('Cookie', auth).send({ name: 'Ticket', description: 'Independent', cost, currency: 'USD' }).expect(201);
      await models().activity.create({ dayId: days[0]._id, name: 'Free', description: 'No cost' });
      for (const amount of [0.5, 0.6]) await request(app.getHttpServer()).post('/api/itineraries/' + id + '/transport-costs').set('Cookie', auth).send({ dayId: days[0]._id.toString(), mode: 'BUS', fromCityId: 'CAI', toCityId: 'GIZ', amount, currency: 'USD' }).expect(201);
      const before = await snapshot(id), result = await getTotals(id).expect(200); reconcile(result.body);
      expect(result.body.totals).toEqual([
        { currency: 'EUR', total: 6, byCategory: { FOOD: 3.6, ACCOMMODATION: 0, IN_CITY_TRANSPORT: 2.4, ACTIVITIES: 0, INTERCITY_TRANSPORT: 0 } },
        { currency: 'USD', total: 3.13, byCategory: { FOOD: 0.1, ACCOMMODATION: 1.03, IN_CITY_TRANSPORT: 0, ACTIVITIES: 0.9, INTERCITY_TRANSPORT: 1.1 } },
      ]);
      expect(result.body.days[0].totals[0].total).toBe(2.1); expect(result.body.days[2].totals).toEqual([]);
      expect(await snapshot(id)).toBe(before);
      expect((await service.findGroups(owner, id)).groups[0].budgetSubtotals).toEqual(result.body.totals.map((row: { currency: string; total: number }) => ({ currency: row.currency, total: row.total })));
    });
    it.each([{ amount: -1 }, { amount: 0.001 }, { amount: '1' }, { category: 'BAD' }, { category: 'INTERCITY_TRANSPORT' }, { currency: 'BTC' }, { currency: null }, { amount: null }, { description: null }, { userId: 'override' }, { dayId: new Types.ObjectId().toString() }])('rejects invalid create/update fields %j', async change => {
      const { id, days } = await seed(1), valid = { category: 'FOOD', amount: 1, currency: 'USD' };
      const entry = await createBudget(id, days[0]._id.toString(), valid).expect(201);
      await createBudget(id, days[0]._id.toString(), { ...valid, ...change }).expect(400);
      await patchBudget(entry.body.id, change).expect(400);
      expect((await getTotals(id).expect(200)).body.totals[0].total).toBe(1);
    });
    it('rejects missing fields, empty PATCH, malformed and nonexistent IDs', async () => {
      const { id, days } = await seed(1), day = days[0]._id.toString();
      for (const body of [{}, { category: 'FOOD' }, { amount: 0, currency: 'USD' }]) await createBudget(id, day, body).expect(400);
      await createBudget('bad', day).expect(400); await createBudget(id, 'bad').expect(400);
      await listBudget(id, 'bad').expect(400); await getTotals('bad').expect(400);
      await patchBudget('bad', { amount: 1 }).expect(400); await deleteBudget('bad').expect(400);
      const entry = await createBudget(id, day).expect(201); await patchBudget(entry.body.id, {}).expect(400);
      await getTotals(oid().toString()).expect(404); await createBudget(id, oid().toString()).expect(404);
      await patchBudget(oid().toString(), { amount: 1 }).expect(404); await deleteBudget(oid().toString()).expect(404);
    });
    it('enforces authentication, owner-only public access and exact itinerary/day association on every route', async () => {
      const a = await seed(1), b = await seed(1), day = a.days[0]._id.toString();
      await models().parent.updateOne({ _id: a.id }, { $set: { visibility: 'PUBLIC' } });
      const entry = await createBudget(a.id, day).expect(201);
      for (const cookies of [[], otherAuth]) {
        const status = cookies.length ? 404 : 401;
        await createBudget(a.id, day, { category: 'FOOD', amount: 1, currency: 'USD' }, cookies).expect(status);
        await listBudget(a.id, day, cookies).expect(status); await getTotals(a.id, cookies).expect(status);
        await patchBudget(entry.body.id, { amount: 2 }, cookies).expect(status); await deleteBudget(entry.body.id, cookies).expect(status);
      }
      await createBudget(b.id, day).expect(404); await listBudget(b.id, day).expect(404);
    });
    it('returns empty arrays for an empty itinerary and no expenses for existing days', async () => {
      const empty = await seed(0); expect((await getTotals(empty.id).expect(200)).body).toEqual({ itineraryId: empty.id, totals: [], days: [] });
      const { id, days } = await seed(2); const result = await getTotals(id).expect(200);
      expect(result.body.totals).toEqual([]); expect(result.body.days.map((day: { totals: unknown[] }) => day.totals)).toEqual([[], []]);
      expect((await listBudget(id, days[0]._id.toString()).expect(200)).body).toEqual([]);
    });
    it('preserves day associations and derives UTC dates after reorder and start-date changes', async () => {
      const { id, days } = await seed(3);
      const entry = await createBudget(id, days[2]._id.toString(), { category: 'FOOD', amount: 1, currency: 'USD' }).expect(201);
      await service.reorderDay(owner, id, days[2]._id.toString(), { newPosition: 1 });
      let result = await getTotals(id).expect(200); reconcile(result.body);
      expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
      expect(result.body.days[0]).toMatchObject({ dayId: days[2]._id.toString(), dayNumber: 1, totals: [{ currency: 'USD', total: 1 }] });
      expect((await models().budget.findById(entry.body.id))!.dayId.toString()).toBe(days[2]._id.toString());
      await service.update(owner, id, { startDate: '2028-12-31' }); result = await getTotals(id).expect(200);
      expect(result.body.days.map((day: { date: string }) => day.date)).toEqual(['2028-12-31', '2029-01-01', '2029-01-02']);
    });
    it('cascades budget records on day and itinerary deletion', async () => {
      const { id, days } = await seed(2);
      const a = await createBudget(id, days[0]._id.toString()).expect(201), b = await createBudget(id, days[1]._id.toString()).expect(201);
      await service.removeDay(owner, id, days[0]._id.toString()); expect(await models().budget.findById(a.body.id)).toBeNull();
      await service.remove(owner, id); expect(await models().budget.findById(b.body.id)).toBeNull(); await getTotals(id).expect(404);
    });
    it.each(['create', 'update', 'delete'] as const)('rolls back parent and entry when %s fails after its database write', async kind => {
      const { id, days } = await seed(1); const entry = await createBudget(id, days[0]._id.toString(), { category: 'FOOD', amount: 1, currency: 'USD' }).expect(201);
      const before = await snapshot(id), collection = models().budget.collection;
      const method = kind === 'create' ? 'insertOne' : kind === 'update' ? 'updateOne' : 'deleteOne';
      const original = collection[method].bind(collection);
      jest.spyOn(collection, method).mockImplementationOnce((async (...args: unknown[]) => {
        await (original as (...values: unknown[]) => Promise<unknown>)(...args); throw new Error('ITN-14 injected failure');
      }) as never);
      if (kind === 'create') await createBudget(id, days[0]._id.toString()).expect(500);
      else if (kind === 'update') await patchBudget(entry.body.id, { amount: 2 }).expect(500);
      else await deleteBudget(entry.body.id).expect(500);
      expect(await snapshot(id)).toBe(before);
    });
    it.each(['day', 'itinerary', 'reorder'] as const)('coordinates creation racing with %s operations without orphans', async kind => {
      const { id, days } = await seed(2), dayId = days[0]._id.toString();
      const mutation = kind === 'day' ? service.removeDay(owner, id, dayId) : kind === 'itinerary' ? service.remove(owner, id) : service.reorderDay(owner, id, dayId, { newPosition: 2 });
      const [created, changed] = await Promise.allSettled([createBudget(id, dayId, { category: 'FOOD', amount: 1, currency: 'USD' }), mutation]);
      expect(changed.status).toBe('fulfilled'); expect(created.status).toBe('fulfilled');
      if (created.status === 'fulfilled') expect(kind === 'reorder' ? [201] : [201, 404]).toContain(created.value.status);
      const records = await models().budget.find({ dayId });
      expect(records.length).toBe(kind === 'reorder' ? 1 : 0);
      if (kind === 'reorder') reconcile((await getTotals(id).expect(200)).body);
    });
    it('serializes concurrent creates and includes every entry once', async () => {
      const { id, days } = await seed(1);
      const results = await Promise.all(Array.from({ length: 4 }, () => createBudget(id, days[0]._id.toString(), { category: 'FOOD', amount: 0.1, currency: 'USD' })));
      expect(results.map(result => result.status)).toEqual([201, 201, 201, 201]);
      const result = await getTotals(id).expect(200); reconcile(result.body); expect(result.body.totals[0].total).toBe(0.4);
    });
    it('keeps a coherent snapshot when a budget edit commits between totals reads', async () => {
      const { id, days } = await seed(1); const entry = await createBudget(id, days[0]._id.toString(), { category: 'FOOD', amount: 1, currency: 'USD' }).expect(201);
      const original = models().parent.findOne.bind(models().parent);
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
      jest.spyOn(models().parent, 'findOne').mockImplementationOnce((...args) => {
        const query = original(...args), exec = query.exec.bind(query);
        jest.spyOn(query, 'exec').mockImplementationOnce(async () => { const result = await exec(); entered(); await gate; return result; });
        return query;
      });
      const pending = app.get(BudgetEntriesService).totals(owner, id);
      await ready;
      try { await patchBudget(entry.body.id, { amount: 2 }).expect(200); } finally { release(); }
      const previous = await pending; reconcile(previous); expect(previous.totals[0].total).toBe(1);
      expect((await getTotals(id).expect(200)).body.totals[0].total).toBe(2);
    });
    it.each(['budget', 'activity', 'transport'] as const)('fails closed on malformed legacy %s costs', async source => {
      for (const value of [-1, NaN, Infinity, '12', 0.001]) {
        const { id, days } = await seed(1);
        await models()[source].collection.insertOne({ dayId: days[0]._id, category: 'FOOD', [source === 'activity' ? 'cost' : 'amount']: value, currency: 'USD' } as never);
        await getTotals(id).expect(409);
      }
    });
    it('rejects unsupported legacy currencies/categories and unsafe totals', async () => {
      for (const change of [{ currency: 'BTC' }, { category: 'BAD' }, { amount: 100000000000000 }]) {
        const { id, days } = await seed(1);
        await models().budget.collection.insertOne({ dayId: days[0]._id, category: 'FOOD', amount: 1, currency: 'USD', ...change });
        await getTotals(id).expect(409);
      }
    });

    it('reconciles all categories and currencies across the maximum 60 days', async () => {
      const { id, days } = await seed(60);
      const expected = new Map<string, bigint>();
      const budget: Record<string, unknown>[] = [], activities: Record<string, unknown>[] = [], transport: Record<string, unknown>[] = [];
      for (const [index, day] of days.entries()) for (const currency of ['USD', 'EUR']) {
        for (const category of Object.values(BudgetCategory)) {
          const cents = index + 1; budget.push({ dayId: day._id, category, amount: cents / 100, currency });
          expected.set(currency, (expected.get(currency) ?? 0n) + BigInt(cents));
        }
        activities.push({ dayId: day._id, name: 'Ticket', description: 'Cost', cost: 0.07, currency });
        transport.push({ dayId: day._id, mode: 'BUS', fromCityId: 'CAI', toCityId: 'GIZ', amount: 0.13, currency });
        expected.set(currency, expected.get(currency)! + 20n);
      }
      await models().budget.insertMany(budget); await models().activity.insertMany(activities); await models().transport.insertMany(transport);
      const result = await getTotals(id).expect(200); reconcile(result.body); expect(result.body.days).toHaveLength(60);
      for (const row of result.body.totals) expect(money(row.total)).toBe(expected.get(row.currency));
      expect((await service.findGroups(owner, id)).groups[0].budgetSubtotals).toEqual(result.body.totals.map((row: { currency: string; total: number }) => ({ currency: row.currency, total: row.total })));
    });
    it('uses one wire-level primary snapshot for ownership, days and totals and releases the session', async () => {
      const { id } = await seed(1, true);
      const commands: { lsid: unknown; readConcern?: { level?: string; atClusterTime?: unknown }; startTransaction?: unknown }[] = [];
      const listener = (event: { databaseName: string; commandName: string; command: typeof commands[number] }) => {
        if (event.databaseName === db.name && ['find', 'aggregate'].includes(event.commandName)) commands.push(event.command);
      };
      const original = db.startSession.bind(db), sessions: Awaited<ReturnType<typeof original>>[] = [];
      jest.spyOn(db, 'startSession').mockImplementation(async options => { const session = await original(options); sessions.push(session); return session; });
      db.getClient().on('commandStarted', listener);
      try { const result = await app.get(BudgetEntriesService).totals(owner, id); reconcile(result); }
      finally { db.getClient().off('commandStarted', listener); }
      expect(commands).toHaveLength(3); expect(sessions).toHaveLength(1); expect(sessions[0].hasEnded).toBe(true);
      for (const command of commands) { expect(command.lsid).toEqual(commands[0].lsid); expect(command.readConcern?.level).toBe('snapshot'); expect(command.startTransaction).toBeUndefined(); }
      expect(commands[1].readConcern?.atClusterTime).toEqual(commands[2].readConcern?.atClusterTime);
      expect(commands[1].readConcern?.atClusterTime).toBeDefined();
    });
    it('refuses missing required legacy amounts/currencies and ignores activities with no cost', async () => {
      for (const source of ['budget', 'transport'] as const) {
        const { id, days } = await seed(1);
        await models()[source].collection.insertOne({ dayId: days[0]._id, category: 'FOOD', currency: 'USD' } as never);
        await getTotals(id).expect(409);
      }
      const { id, days } = await seed(1);
      await models().activity.collection.insertOne({ dayId: days[0]._id, cost: 1 } as never); await getTotals(id).expect(409);
      await models().activity.deleteMany({ dayId: days[0]._id });
      await models().activity.collection.insertOne({ dayId: days[0]._id, cost: null } as never);
      expect((await getTotals(id).expect(200)).body.totals).toEqual([]);
    });
    it.each([
      ['post', 'day'], ['get', 'day'], ['patch', 'entry'], ['delete', 'entry'], ['get', 'summary'],
    ] as const)('returns 404 for obsolete %s %s route without changing stored budgets', async (method, kind) => {
      const { id, days } = await seed(1);
      const entry = await createBudget(id, days[0]._id.toString(), { category: 'FOOD', amount: 1, currency: 'USD' }).expect(201);
      const before = await snapshot(id);
      const route = kind === 'day' ? '/api/itineraries/' + id + '/days/' + days[0]._id + '/budget-entries'
        : kind === 'entry' ? '/api/budget-entries/' + entry.body.id : '/api/itineraries/' + id + '/budget-totals';
      const call = request(app.getHttpServer())[method](route).set('Cookie', auth);
      if (method === 'post') call.send({ category: 'FOOD', amount: 2, currency: 'USD' });
      if (method === 'patch') call.send({ amount: 2 });
      await call.expect(404);
      expect(await snapshot(id)).toBe(before);
    });
    it('documents all five authenticated endpoints and response-only transport category', () => {
      const document = SwaggerModule.createDocument(app, createSwaggerConfig());
      for (const [route, methods] of [['/api/itineraries/{id}/days/{dayId}/budgets', ['get', 'post']], ['/api/budgets/{id}', ['patch', 'delete']], ['/api/itineraries/{id}/budget-summary', ['get']]] as const) {
        for (const method of methods) {
          const operation = document.paths[route][method]!;
          expect(operation.security).toContainEqual({ access_token: [] });
          expect(operation.tags).toEqual(['budgets']);
          expect(operation.responses).toHaveProperty(method === 'post' ? '201' : '200');
        }
      }
      for (const obsolete of ['/api/itineraries/{id}/days/{dayId}/budget-entries', '/api/budget-entries/{id}', '/api/itineraries/{id}/budget-totals'])
        expect(document.paths).not.toHaveProperty(obsolete);
      expect(document.components!.schemas!.CreateBudgetEntryDto.properties!.category).toMatchObject({ enum: Object.values(BudgetCategory) });
      expect(document.components!.schemas!.BudgetCategoryTotalsDto.properties).toHaveProperty('INTERCITY_TRANSPORT');
    });
  });

});
 