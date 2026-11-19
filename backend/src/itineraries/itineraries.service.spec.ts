
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Types, mongo } from 'mongoose';
import { ItinerariesService } from './itineraries.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderItineraryDayDto } from './dto/reorder-itinerary-day.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';
import { ItineraryVisibility } from './schemas/itinerary.schema';
 
describe('ITN-07 transaction retry policy', () => {
  const owner = new Types.ObjectId().toString();
  const id = new Types.ObjectId().toString();
  let service: ItinerariesService;
  let session: { startTransaction: jest.Mock; commitTransaction: jest.Mock; abortTransaction: jest.Mock; endSession: jest.Mock; inTransaction: jest.Mock };
  let connection: { startSession: jest.Mock };
  const labelled = (...labels: string[]) => Object.assign(new Error(labels.join(', ')), { hasErrorLabel: (value: string) => labels.includes(value) });
  beforeEach(() => {
    session = { startTransaction: jest.fn(), commitTransaction: jest.fn().mockResolvedValue(undefined), abortTransaction: jest.fn().mockResolvedValue(undefined), endSession: jest.fn().mockResolvedValue(undefined), inTransaction: jest.fn().mockReturnValue(true) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    const parent = { findOneAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(id) }) }) };
    service = new ItinerariesService(parent as never, {} as never, {} as never, {} as never, {} as never, {} as never, connection as never, {} as never, {} as never);
  });
  it('bounds transient transaction retries and returns 409', async () => {
    const work = jest.fn().mockRejectedValue(labelled('TransientTransactionError'));
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBeInstanceOf(ConflictException);
    expect(work).toHaveBeenCalledTimes(5);
    expect(session.abortTransaction).toHaveBeenCalledTimes(5);
    expect(session.endSession).toHaveBeenCalledTimes(5);
  });
  it('retries eligible conflicts from a new transaction', async () => {
    const work = jest.fn().mockRejectedValueOnce(labelled('TransientTransactionError')).mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).resolves.toBe('ok');
    expect(connection.startSession).toHaveBeenCalledTimes(2);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
  it('does not retry business failures or unlabelled duplicate-key errors', async () => {
    const error = Object.assign(new Error('duplicate'), { code: 11000 });
    const work = jest.fn().mockRejectedValue(error);
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
  it('retries an uncertain commit without replaying the callback', async () => {
    session.commitTransaction.mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).resolves.toBe('ok');
    expect(session.commitTransaction).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenCalledTimes(1);
  });
  it('bounds uncertain commit retries and reports ambiguity without replay', async () => {
    session.commitTransaction.mockRejectedValue(labelled('UnknownTransactionCommitResult'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(session.commitTransaction).toHaveBeenCalledTimes(5);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
  });
  it('restarts after an uncertain commit followed by a definitive transient failure', async () => {
    session.commitTransaction.mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'))
      .mockRejectedValueOnce(labelled('TransientTransactionError'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).resolves.toBe('ok');
    expect(session.commitTransaction).toHaveBeenCalledTimes(3);
    expect(connection.startSession).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenCalledTimes(2);
  });
  it('prioritizes uncertainty when a commit error contains both labels', async () => {
    session.commitTransaction.mockRejectedValueOnce(labelled('UnknownTransactionCommitResult', 'TransientTransactionError'))
      .mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).resolves.toBe('ok');
    expect(session.commitTransaction).toHaveBeenCalledTimes(3);
    expect(connection.startSession).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
  });
  it('bounds repeated dual-label uncertain commits without replaying side effects', async () => {
    session.commitTransaction.mockRejectedValue(labelled('UnknownTransactionCommitResult', 'TransientTransactionError'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(session.commitTransaction).toHaveBeenCalledTimes(5);
    expect(connection.startSession).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
  });
  it('restarts after definite transient commit failures and then commits successfully', async () => {
    session.commitTransaction.mockRejectedValueOnce(labelled('TransientTransactionError'))
      .mockRejectedValueOnce(labelled('TransientTransactionError'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).resolves.toBe('ok');
    expect(session.commitTransaction).toHaveBeenCalledTimes(3);
    expect(connection.startSession).toHaveBeenCalledTimes(3);
    expect(work).toHaveBeenCalledTimes(3);
  });
  it('bounds repeated definite transient commit failures with HTTP 409', async () => {
    session.commitTransaction.mockRejectedValue(labelled('TransientTransactionError'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBeInstanceOf(ConflictException);
    expect(session.commitTransaction).toHaveBeenCalledTimes(5);
    expect(connection.startSession).toHaveBeenCalledTimes(5);
    expect(work).toHaveBeenCalledTimes(5);
  });
  it('bounds repeated uncertain-then-definitive-transient sequences', async () => {
    let commits = 0;
    session.commitTransaction.mockImplementation(async () => {
      throw labelled(++commits % 2 ? 'UnknownTransactionCommitResult' : 'TransientTransactionError');
    });
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBeInstanceOf(ConflictException);
    expect(session.commitTransaction).toHaveBeenCalledTimes(10);
    expect(connection.startSession).toHaveBeenCalledTimes(5);
    expect(work).toHaveBeenCalledTimes(5);
  });
  it.each([false, true])('does not replay on a non-retryable commit error (earlier uncertainty: %s)', async uncertainFirst => {
    const failure = new Error('Non-retryable commit failure');
    if (uncertainFirst) session.commitTransaction.mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'));
    session.commitTransaction.mockRejectedValueOnce(failure);
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withDayTransaction'](owner, id, work)).rejects.toBe(failure);
    expect(session.commitTransaction).toHaveBeenCalledTimes(uncertainFirst ? 2 : 1);
    expect(connection.startSession).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid IDs before opening a transaction', async () => {
    await expect(service.removeDay(owner, 'bad', id)).rejects.toMatchObject({ status: 400 });
    await expect(service.removeDay(owner, id, 'bad')).rejects.toMatchObject({ status: 400 });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
});
 
describe('ITN-08 reorderDay', () => {
  const owner = new Types.ObjectId().toString();
  const itineraryId = new Types.ObjectId();
  const parent = { _id: itineraryId, startDate: new Date('2028-02-28T00:00:00Z') };
  let rows: { _id: Types.ObjectId; itineraryId: Types.ObjectId; dayNumber: number; cityId: string; notes: string; __v: number }[];
  let service: ItinerariesService;
  let session: { startTransaction: jest.Mock; commitTransaction: jest.Mock; abortTransaction: jest.Mock; endSession: jest.Mock; inTransaction: jest.Mock };
  let model: { find: jest.Mock; updateOne: jest.Mock };
  let parentModel: { findOneAndUpdate: jest.Mock };
  const labelled = (label: string) => Object.assign(new Error(label), { hasErrorLabel: (value: string) => value === label });
  beforeEach(() => {
    rows = Array.from({ length: 4 }, (_, index) => ({
      _id: new Types.ObjectId(), itineraryId, dayNumber: index + 1,
      cityId: `CITY-${index}`, notes: `notes-${index}`, __v: 7,
    }));
    session = { startTransaction: jest.fn(), commitTransaction: jest.fn().mockResolvedValue(undefined), abortTransaction: jest.fn().mockResolvedValue(undefined), endSession: jest.fn().mockResolvedValue(undefined), inTransaction: jest.fn().mockReturnValue(true) };
    model = {
      find: jest.fn(() => ({ sort: () => ({ session: () => ({ lean: async () => rows.map(row => ({ ...row })).sort((a, b) => a.dayNumber - b.dayNumber) }) }) })),
      updateOne: jest.fn(async (filter, update) => {
        const row = rows.find(item => item._id.equals(filter._id) && item.itineraryId.equals(filter.itineraryId) && item.dayNumber === filter.dayNumber);
        if (!row) return { matchedCount: 0, modifiedCount: 0 };
        if (rows.some(item => item !== row && item.dayNumber === update.$set.dayNumber)) throw Object.assign(new Error('duplicate'), { code: 11000 });
        row.dayNumber = update.$set.dayNumber;
        return { matchedCount: 1, modifiedCount: 1 };
      }),
    };
    parentModel = { findOneAndUpdate: jest.fn(() => ({ lean: async () => parent })) };
    service = new ItinerariesService(parentModel as never, {} as never, model as never, {} as never, {} as never, {} as never, { startSession: async () => session } as never, {} as never, {} as never);
  });
  const reorder = (day: string, newPosition: number) => service.reorderDay(owner, itineraryId.toString(), day, { newPosition });
  it.each([[3, 2, [0, 3, 1, 2]], [0, 4, [1, 2, 3, 0]], [2, 1, [2, 0, 1, 3]]] as const)('moves index %s to position %s without collisions', async (index, position, order) => {
    const original = rows.map(row => ({ ...row }));
    const result = await reorder(rows[index]._id.toString(), position);
    expect(result.days.map(day => day._id)).toEqual(order.map(i => original[i]._id.toString()));
    expect(result.days.map(day => day.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(result.days.map(day => day.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02']);
    for (const day of result.days) {
      const before = original.find(row => row._id.toString() === day._id)!;
      expect(day).toMatchObject({ cityId: before.cityId, notes: before.notes, itineraryId: itineraryId.toString() });
      expect(Object.keys(day).sort()).toEqual(['_id', 'cityId', 'date', 'dayNumber', 'itineraryId', 'notes']);
    }
    expect(model.updateOne.mock.calls[0][2]).toEqual({ session, runValidators: false });
    for (const call of model.updateOne.mock.calls.slice(1)) expect(call[2]).toEqual({ session, runValidators: true });
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  });
  it.each([1, 4])('does not update days on a same-position move (%s days)', async count => {
    rows = rows.slice(0, count);
    await reorder(rows[0]._id.toString(), 1);
    expect(model.updateOne).not.toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, '2', 0, -1, 1.5, 61, NaN, Infinity])('rejects invalid position %s before opening a transaction', async value => {
    await expect(reorder(rows[0]._id.toString(), value as number)).rejects.toMatchObject({ status: 400 });
    expect(parentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it.each([{}, { newPosition: null }, { newPosition: '2' }, { newPosition: 0 }, { newPosition: -1 }, { newPosition: 1.5 }, { newPosition: 61 }])('validates the request DTO %j', async body => {
    expect((await validate(plainToInstance(ReorderItineraryDayDto, body))).length).toBeGreaterThan(0);
  });
  it('accepts an integer DTO position', async () => {
    expect(await validate(plainToInstance(ReorderItineraryDayDto, { newPosition: 2 }))).toEqual([]);
  });
  it('rejects positions beyond the current count', async () => {
    await expect(reorder(rows[0]._id.toString(), 5)).rejects.toMatchObject({ status: 400 });
    expect(model.updateOne).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
  it('accepts uppercase hexadecimal day IDs', async () => {
    const selected = rows[3]._id.toString();
    const result = await reorder(selected.toUpperCase(), 2);
    expect(result.days[1]._id).toBe(selected);
  });
  it('validates both object IDs', async () => {
    await expect(reorder('bad', 1)).rejects.toMatchObject({ status: 400 });
    await expect(service.reorderDay(owner, 'bad', rows[0]._id.toString(), { newPosition: 1 })).rejects.toMatchObject({ status: 400 });
    expect(parentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('hides missing or foreign-owned itineraries', async () => {
    parentModel.findOneAndUpdate.mockReturnValue({ lean: async () => null });
    await expect(reorder(rows[0]._id.toString(), 1)).rejects.toMatchObject({ status: 404 });
    expect(parentModel.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: itineraryId, userId: new Types.ObjectId(owner) });
    expect(model.find).not.toHaveBeenCalled();
  });
  it.each([false, true])('rejects absent or cross-itinerary days (empty: %s)', async empty => {
    if (empty) rows = [];
    await expect(reorder(new Types.ObjectId().toString(), 1)).rejects.toMatchObject({ status: 404 });
    expect(model.updateOne).not.toHaveBeenCalled();
  });
  it('rejects existing gaps instead of parking in an occupied slot', async () => {
    rows[3].dayNumber = 5;
    await expect(reorder(rows[0]._id.toString(), 2)).rejects.toMatchObject({ status: 409 });
    expect(model.updateOne).not.toHaveBeenCalled();
  });
  it.each([0, 1])('aborts when an update matches/modifies %s documents', async count => {
    model.updateOne.mockResolvedValueOnce({ matchedCount: count, modifiedCount: 0 });
    await expect(reorder(rows[3]._id.toString(), 2)).rejects.toMatchObject({ status: 409 });
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });
  it('aborts a failed shift without attempting commit', async () => {
    const original = model.updateOne.getMockImplementation()!;
    model.updateOne.mockImplementationOnce(original).mockRejectedValueOnce(new Error('shift failed'));
    await expect(reorder(rows[3]._id.toString(), 2)).rejects.toThrow('shift failed');
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });
  it('does not retry an unlabelled duplicate-key failure', async () => {
    model.updateOne.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    await expect(reorder(rows[3]._id.toString(), 2)).rejects.toMatchObject({ code: 11000 });
    expect(model.updateOne).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
  it('verifies the final persisted sequence before committing', async () => {
    model.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    // Simulate an incorrect final database read despite acknowledged updates.
    model.find.mockReturnValueOnce({ sort: () => ({ session: () => ({ lean: async () => rows.map(row => ({ ...row })) }) }) })
      .mockReturnValueOnce({ sort: () => ({ session: () => ({ lean: async () => [{ ...rows[0], dayNumber: 61 }] }) }) });
    await expect(reorder(rows[3]._id.toString(), 2)).rejects.toMatchObject({ status: 409 });
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });
  it('retries a transient body failure with fresh reads', async () => {
    model.updateOne.mockRejectedValueOnce(labelled('TransientTransactionError'));
    await reorder(rows[3]._id.toString(), 2);
    expect(session.startTransaction).toHaveBeenCalledTimes(2);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(model.find).toHaveBeenCalledTimes(3);
  });
  it('bounds transient reorder failures', async () => {
    model.updateOne.mockRejectedValue(labelled('TransientTransactionError'));
    await expect(reorder(rows[3]._id.toString(), 2)).rejects.toBeInstanceOf(ConflictException);
    expect(model.updateOne).toHaveBeenCalledTimes(5);
  });
  it.each([false, true])('never replays shifts on uncertain commit (exhausted: %s)', async exhausted => {
    if (exhausted) session.commitTransaction.mockRejectedValue(labelled('UnknownTransactionCommitResult'));
    else session.commitTransaction.mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'));
    const operation = reorder(rows[3]._id.toString(), 2);
    if (exhausted) await expect(operation).rejects.toBeInstanceOf(ServiceUnavailableException);
    else await expect(operation).resolves.toHaveProperty('days');
    expect(model.updateOne).toHaveBeenCalledTimes(4);
    expect(session.startTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalledTimes(exhausted ? 5 : 2);
  });
});
 
describe('ITN-09 read-only group snapshots', () => {
  const owner = new Types.ObjectId().toString();
  const id = new Types.ObjectId();
  let service: ItinerariesService;
  let parent: { _id: Types.ObjectId; startDate: Date } | null;
  let days: { _id: Types.ObjectId; itineraryId: Types.ObjectId; dayNumber: number; cityId: string }[];
  let cities: { cityId: string; name: string; countryCode: string }[];
  let totals: { groupIndex: number; currency: string; total: number; invalid: number; supportedCurrency: boolean }[];
  const query = (get: () => unknown) => ({
    session: jest.fn().mockReturnThis(), read: jest.fn().mockReturnThis(), maxTimeMS: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(), lean: jest.fn(async () => get()),
  });
  let parentQuery: ReturnType<typeof query>;
  let dayQuery: ReturnType<typeof query>;
  let cityQuery: ReturnType<typeof query>;
  let aggregate: { session: jest.Mock; read: jest.Mock; option: jest.Mock };
  let dayModel: { find: jest.Mock; aggregate: jest.Mock };
  let parentModel: { findOne: jest.Mock };
  let cityModel: { find: jest.Mock };
  let session: { endSession: jest.Mock; startTransaction: jest.Mock; commitTransaction: jest.Mock };
  let connection: { startSession: jest.Mock };
  beforeEach(() => {
    parent = { _id: id, startDate: new Date('2028-02-28T00:00:00Z') };
    days = ['CAI', 'CAI', 'GIZ', 'CAI'].map((cityId, index) => ({ _id: new Types.ObjectId(), itineraryId: id, dayNumber: index + 1, cityId }));
    cities = [{ cityId: 'CAI', name: 'Cairo', countryCode: 'EG' }, { cityId: 'GIZ', name: 'Giza', countryCode: 'EG' }];
    totals = [{ groupIndex: 0, currency: 'USD', total: 0.3, invalid: 0, supportedCurrency: true }];
    parentQuery = query(() => parent); dayQuery = query(() => days); cityQuery = query(() => cities);
    aggregate = { session: jest.fn().mockReturnThis(), read: jest.fn().mockReturnThis(), option: jest.fn(async () => totals) };
    parentModel = { findOne: jest.fn(() => parentQuery) };
    dayModel = { find: jest.fn(() => dayQuery), aggregate: jest.fn(() => aggregate) };
    cityModel = { find: jest.fn(() => cityQuery) };
    session = { endSession: jest.fn().mockResolvedValue(undefined), startTransaction: jest.fn(), commitTransaction: jest.fn() };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    const source = (name: string) => ({ collection: { name } });
    service = new ItinerariesService(parentModel as never, {} as never, dayModel as never,
      source('activities') as never, source('budgetentries') as never, source('transportcosts') as never,
      connection as never, cityModel as never, {} as never);
  });
  const read = () => service.findGroups(owner, id.toString());
  it('uses one snapshot session for every read and aggregation, without writes or transactions', async () => {
    const result = await read();
    expect(connection.startSession).toHaveBeenCalledWith({ snapshot: true, causalConsistency: false });
    expect(parentModel.findOne).toHaveBeenCalledWith({ _id: id, userId: new Types.ObjectId(owner) });
    expect(dayQuery.sort).toHaveBeenCalledWith({ dayNumber: 1 });
    expect(cityModel.find).toHaveBeenCalledWith({ cityId: { $in: ['CAI', 'GIZ'] } });
    for (const q of [parentQuery, dayQuery, cityQuery, aggregate]) {
      expect(q.session).toHaveBeenCalledWith(session);
      expect(q.read).toHaveBeenCalledWith('primary');
    }
    const lookups = dayModel.aggregate.mock.calls[0][0].filter((stage: { $lookup?: unknown }) => stage.$lookup);
    expect(lookups.map((stage: { $lookup: { from: string } }) => stage.$lookup.from)).toEqual(['activities', 'budgetentries', 'transportcosts', 'currencies']);
    expect(dayModel.aggregate).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(session.startTransaction).not.toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(result.groups.map(group => group.dayCount)).toEqual([2, 1, 1]);
    expect(result.groups[0]).toEqual({
      city: cities[0], firstDay: { id: days[0]._id.toString(), dayNumber: 1, date: '2028-02-28' },
      lastDay: { id: days[1]._id.toString(), dayNumber: 2, date: '2028-02-29' },
      dayIds: days.slice(0, 2).map(day => day._id.toString()), dayCount: 2,
      budgetSubtotals: [{ currency: 'USD', total: 0.3 }],
    });
    expect(result.groups[1].budgetSubtotals).toEqual([]);
    expect(result.groups[2].firstDay.date).toBe('2028-03-02');
  });
  it('returns an empty itinerary without querying reference data or expenses', async () => {
    days = [];
    expect(await read()).toEqual({ itineraryId: id.toString(), groups: [] });
    expect(cityModel.find).not.toHaveBeenCalled();
    expect(dayModel.aggregate).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('handles a single day and explicit zero subtotal', async () => {
    days = days.slice(0, 1); totals[0].total = 0;
    const result = await read();
    expect(result.groups[0].firstDay).toEqual(result.groups[0].lastDay);
    expect(result.groups[0].budgetSubtotals).toEqual([{ currency: 'USD', total: 0 }]);
  });
  it('rejects invalid IDs before starting a session', async () => {
    await expect(service.findGroups(owner, 'bad')).rejects.toMatchObject({ status: 400 });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('hides missing or foreign-owned itineraries and releases the session', async () => {
    parent = null;
    await expect(read()).rejects.toMatchObject({ status: 404 });
    expect(dayModel.find).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it.each(['gap', 'duplicate', 'fraction', 'over-limit', 'missing-city', 'blank-city', 'unknown-city', 'invalid-reference'])('rejects invalid existing %s data', async kind => {
    if (kind === 'gap') days[1].dayNumber = 3;
    if (kind === 'duplicate') days[1].dayNumber = 1;
    if (kind === 'fraction') days[1].dayNumber = 1.5;
    if (kind === 'over-limit') days = Array.from({ length: 61 }, (_, index) => ({ ...days[0], _id: new Types.ObjectId(), dayNumber: index + 1 }));
    if (kind === 'missing-city') days[0].cityId = undefined as never;
    if (kind === 'blank-city') days[0].cityId = ' ';
    if (kind === 'unknown-city') days[0].cityId = 'UNKNOWN';
    if (kind === 'invalid-reference') cities[0].countryCode = '';
    await expect(read()).rejects.toMatchObject({ status: 409 });
    expect(dayModel.aggregate).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it.each([
    { invalid: 1 }, { supportedCurrency: false }, { currency: null }, { currency: 'usd' },
    { total: NaN }, { total: Infinity }, { total: -1 }, { total: null }, { groupIndex: -1 }, { groupIndex: 20 },
  ])('rejects invalid aggregation output %j without returning partial totals', async invalid => {
    totals[0] = { ...totals[0], ...invalid } as typeof totals[number];
    await expect(read()).rejects.toMatchObject({ status: 409 });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it.each(['parent', 'days', 'cities', 'aggregate'])('releases the session when %s reading fails', async stage => {
    const failure = new Error('Required data unavailable');
    if (stage === 'aggregate') aggregate.option.mockRejectedValueOnce(failure);
    else ({ parent: parentQuery, days: dayQuery, cities: cityQuery }[stage]).lean.mockRejectedValueOnce(failure);
    await expect(read()).rejects.toBe(failure);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it.each([50, 239, 246])('maps snapshot/timeout error %s to 503', async code => {
    dayQuery.lean.mockRejectedValueOnce(Object.assign(new Error('Snapshot read failed'), { code }));
    await expect(read()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('reports network failures as 503', async () => {
    aggregate.option.mockRejectedValueOnce(Object.assign(new Error('Disconnected'), { name: 'MongoNetworkError' }));
    await expect(read()).rejects.toMatchObject({ status: 503 });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('never falls back to weaker reads when snapshot support fails', async () => {
    const failure = Object.assign(new Error('Snapshots unsupported'), { name: 'MongoCompatibilityError' });
    parentQuery.lean.mockRejectedValueOnce(failure);
    await expect(read()).rejects.toBe(failure);
    expect(connection.startSession).toHaveBeenCalledTimes(1);
    expect(parentQuery.lean).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});


describe('ITN-20 visibility updates', () => {
  const owner = new Types.ObjectId().toString(), id = new Types.ObjectId();
  let service: ItinerariesService;
  let document: { userId: Types.ObjectId; visibility: ItineraryVisibility | null; title: string; save: jest.Mock; toObject: jest.Mock };
  let parent: { findById: jest.Mock; findOneAndUpdate: jest.Mock };
  let session: { startTransaction: jest.Mock; commitTransaction: jest.Mock; abortTransaction: jest.Mock; endSession: jest.Mock; inTransaction: jest.Mock };
  let connection: { startSession: jest.Mock };
  beforeEach(() => {
    document = { userId: new Types.ObjectId(owner), visibility: ItineraryVisibility.PRIVATE, title: 'Keep', save: jest.fn(), toObject: jest.fn() };
    document.save.mockImplementation(async () => document);
    document.toObject.mockImplementation(() => ({ title: document.title, visibility: document.visibility }));
    session = { startTransaction: jest.fn(), commitTransaction: jest.fn().mockResolvedValue(undefined), abortTransaction: jest.fn().mockResolvedValue(undefined), endSession: jest.fn().mockResolvedValue(undefined), inTransaction: jest.fn().mockReturnValue(true) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    parent = { findById: jest.fn().mockResolvedValue(document), findOneAndUpdate: jest.fn((filter, update) => update.$inc ? { lean: async () => ({ _id: id }) } : Promise.resolve({ ...update.$set, _id: id })) };
    const countries = { find: jest.fn(() => ({ lean: async () => [{ code: 'EG' }] })) };
    service = new ItinerariesService(parent as never, countries as never, {} as never, {} as never, {} as never, {} as never, connection as never, {} as never, {} as never);
  });
  it.each([ItineraryVisibility.PUBLIC, ItineraryVisibility.PRIVATE])('commits %s with the shared parent write and only allowed supplied fields', async visibility => {
    const dto = { visibility, title: 'Changed', countryIds: ['EG'], startDate: '2028-02-29', userId: 'attacker', isHidden: false };
    const result = await service.update(owner, id.toString(), dto);
    expect(result).toHaveProperty('visibility', visibility);
    expect(parent.findOneAndUpdate.mock.calls[0][1]).toEqual({ $inc: { __v: 1 } });
    expect(parent.findOneAndUpdate.mock.calls[1]).toEqual([
      { _id: id, userId: new Types.ObjectId(owner) },
      { $set: { visibility, title: 'Changed', countryIds: ['EG'], startDate: new Date('2028-02-29T00:00:00.000Z') } },
      { session, returnDocument: 'after', runValidators: true },
    ]);
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(document.save).not.toHaveBeenCalled();
  });
  it('preserves ordinary PATCH behavior and does not acquire a transaction', async () => {
    await service.update(owner, id.toString(), { title: 'Ordinary' });
    expect(document.save).toHaveBeenCalledTimes(1);
    expect(document.visibility).toBe(ItineraryVisibility.PRIVATE);
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('normalizes legacy null only in an ordinary PATCH response', async () => {
    document.visibility = null;
    const result = await service.update(owner, id.toString(), {});
    expect(result).toHaveProperty('visibility', ItineraryVisibility.PRIVATE);
    expect(document.visibility).toBeNull();
  });
  it.each([null, '', 'public', 'private', 'OTHER', 1, true, {}])('rejects invalid visibility %j at DTO and service boundaries', async value => {
    expect((await validate(plainToInstance(UpdateItineraryDto, { visibility: value }))).some(error => error.property === 'visibility')).toBe(true);
    await expect(service.update(owner, id.toString(), { visibility: value as never })).rejects.toMatchObject({ status: 400 });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('accepts omitted visibility in the existing partial update DTO', async () => {
    expect(await validate(plainToInstance(UpdateItineraryDto, { title: 'Valid' }))).toEqual([]);
  });
  it('keeps nonexistent/nonowner update status conventions and validates IDs', async () => {
    await expect(service.update(owner, 'bad', { visibility: ItineraryVisibility.PUBLIC })).rejects.toMatchObject({ status: 400 });
    parent.findById.mockResolvedValueOnce(null);
    await expect(service.update(owner, id.toString(), { visibility: ItineraryVisibility.PUBLIC })).rejects.toMatchObject({ status: 404 });
    document.userId = new Types.ObjectId();
    await expect(service.update(owner, id.toString(), { visibility: ItineraryVisibility.PUBLIC })).rejects.toMatchObject({ status: 403 });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('retries commit only after an ambiguous result and never repeats the visibility write', async () => {
    session.commitTransaction.mockRejectedValueOnce(Object.assign(new Error('Ambiguous'), { hasErrorLabel: (label: string) => label === 'UnknownTransactionCommitResult' }));
    await service.update(owner, id.toString(), { visibility: ItineraryVisibility.PUBLIC });
    expect(parent.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(session.commitTransaction).toHaveBeenCalledTimes(2);
  });
  it('aborts a failed visibility write', async () => {
    parent.findOneAndUpdate.mockImplementationOnce(() => ({ lean: async () => ({ _id: id }) })).mockRejectedValueOnce(new Error('Write failed'));
    await expect(service.update(owner, id.toString(), { visibility: ItineraryVisibility.PRIVATE })).rejects.toThrow('Write failed');
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

describe('ITN-20 public read consistency and allowlists', () => {
  const id = new Types.ObjectId();
  const stamp = new mongo.Timestamp({ t: 10, i: 1 });
  let service: ItinerariesService;
  let session: { endSession: jest.Mock };
  let connection: { getClient: jest.Mock; startSession: jest.Mock; db: { command: jest.Mock; runCursorCommand: jest.Mock } };
  let cursor: { toArray: jest.Mock; close: jest.Mock };
  const item = () => ({ id: id.toString(), title: 'Public trip', countryIds: ['EG'], startDate: '2028-02-28', visibility: ItineraryVisibility.PUBLIC, dayCount: 1,
    userId: 'secret', notes: 'secret', __v: 3, days: [{ id: 'day', dayNumber: 1, cityId: 'CAI', date: '2028-02-28', notes: 'secret' }] });
  beforeEach(() => {
    session = { endSession: jest.fn().mockResolvedValue(undefined) };
    cursor = { toArray: jest.fn().mockResolvedValue([item()]), close: jest.fn().mockResolvedValue(undefined) };
    connection = { getClient: jest.fn(), startSession: jest.fn().mockReturnValue(session), db: {
      command: jest.fn().mockResolvedValue({ operationTime: stamp, cursor: { firstBatch: [{ visibility: 'PUBLIC', isHidden: false }] } }),
      runCursorCommand: jest.fn().mockReturnValue(cursor),
    } };
    connection.getClient.mockReturnValue({ startSession: connection.startSession });
    service = new ItinerariesService({ collection: { name: 'itineraries' } } as never, {} as never, { collection: { name: 'itinerarydays' } } as never,
      { collection: { name: 'activities' } } as never, { collection: { name: 'budgetentries' } } as never, { collection: { name: 'transportcosts' } } as never,
      connection as never, {} as never, { collection: { name: 'users' } } as never);
  });
  afterEach(() => jest.restoreAllMocks());
  it('pins the detail snapshot to reply.operationTime and rechecks outside the snapshot', async () => {
    const result = await service.findPublicOne(id.toString());
    expect(connection.startSession).toHaveBeenCalledWith({ causalConsistency: false });
    expect(connection.db.command).toHaveBeenCalledTimes(2);
    for (const [command, options] of connection.db.command.mock.calls) {
      expect(command).toMatchObject({ filter: { _id: id }, limit: 1, singleBatch: true, readConcern: { level: 'linearizable' } });
      expect(options).toMatchObject({ session, readPreference: 'primary' });
      expect(options.timeoutMS).toBeGreaterThan(0);
      expect(options.timeoutMS).toBeLessThanOrEqual(5000);
    }
    expect(connection.db.runCursorCommand.mock.calls[0][0].readConcern).toEqual({ level: 'snapshot', atClusterTime: stamp });
    expect(result).toEqual({ id: id.toString(), title: 'Public trip', countryIds: ['EG'], startDate: '2028-02-28', visibility: 'PUBLIC', dayCount: 1, author: { name: null },
      days: [{ id: 'day', dayNumber: 1, cityId: 'CAI', date: '2028-02-28', activities: [], budgetEntries: [], transportCosts: [] }] });
    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('uses one visibility-filtered facet for counts and pagination and no barrier documents', async () => {
    cursor.toArray.mockResolvedValueOnce([{ items: [item()], meta: [{ total: 11 }] }]);
    const result = await service.findPublic(2);
    expect(connection.db.command).toHaveBeenCalledTimes(1);
    expect(connection.db.command.mock.calls[0][0]).toHaveProperty('find', 'itineraries');
    const pipeline = connection.db.runCursorCommand.mock.calls[0][0].pipeline;
    expect(pipeline[0]).toEqual({ $match: { visibility: 'PUBLIC', isHidden: { $ne: true } } });
    expect(pipeline[2].$facet.items.slice(0, 2)).toEqual([{ $skip: 10 }, { $limit: 10 }]);
    expect(pipeline[2].$facet.meta).toEqual([{ $count: 'total' }]);
    expect(result).toMatchObject({ total: 11, page: 2, pageSize: 10, totalPages: 2 });
    expect(Object.keys(result.items[0]).sort()).toEqual(['countryIds', 'dayCount', 'id', 'startDate', 'title', 'visibility']);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('ITN-21: returns author name, activities (timed first), budget entries and transport costs with allowlisted fields only', async () => {
    cursor.toArray.mockResolvedValueOnce([{ ...item(), authorUser: [{ firstName: 'Sara', lastName: 'Ali', email: 'secret' }],
      days: [{ id: 'day', dayNumber: 1, cityId: 'CAI', date: '2028-02-28', notes: 'secret',
        activities: [
          { id: 'a2', name: 'Museum', description: 'Visit', images: [], dayId: 'secret' },
          { id: 'a1', name: 'Tour', description: 'Walk', time: '09:00', cost: 10, currency: 'EGP', images: ['/api/uploads/x.jpg'], __v: 0 },
        ],
        budgetEntries: [{ id: 'b1', category: 'FOOD', description: 'Lunch', amount: 5, currency: 'EGP', dayId: 'secret' }],
        transportCosts: [{ id: 't1', mode: 'TRAIN', fromCityId: 'cairo', toCityId: 'alexandria', amount: 20, currency: 'EGP', createdAt: 'secret' }],
      }] }]);
    const result = await service.findPublicOne(id.toString());
    expect(result.author).toEqual({ name: 'Sara Ali' });
    expect(result.days[0]).toEqual({ id: 'day', dayNumber: 1, cityId: 'CAI', date: '2028-02-28',
      activities: [
        { id: 'a1', name: 'Tour', description: 'Walk', time: '09:00', cost: 10, currency: 'EGP', images: ['/api/uploads/x.jpg'] },
        { id: 'a2', name: 'Museum', description: 'Visit', time: undefined, cost: undefined, currency: undefined, images: [] },
      ],
      budgetEntries: [{ id: 'b1', category: 'FOOD', description: 'Lunch', amount: 5, currency: 'EGP' }],
      transportCosts: [{ id: 't1', mode: 'TRAIN', fromCityId: 'cairo', toCityId: 'alexandria', amount: 20, currency: 'EGP' }],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    const lookups = JSON.stringify(connection.db.runCursorCommand.mock.calls[0][0].pipeline);
    for (const from of ['activities', 'budgetentries', 'transportcosts', 'users']) expect(lookups).toContain(`"from":"${from}"`);
  });
  it('returns empty discovery results', async () => {
    cursor.toArray.mockResolvedValueOnce([{ items: [], meta: [] }]);
    expect(await service.findPublic()).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });
  it.each([null, {}, { visibility: null }, { visibility: 'PRIVATE' }, { visibility: 'PUBLIC', isHidden: true }])('rejects inaccessible initial state %j', async inaccessible => {
    connection.db.command.mockResolvedValueOnce({ operationTime: stamp, cursor: { firstBatch: inaccessible ? [inaccessible] : [] } });
    await expect(service.findPublicOne(id.toString())).rejects.toMatchObject({ status: 404 });
    expect(connection.db.runCursorCommand).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it.each([{ final: [] }, { final: [{ visibility: 'PRIVATE' }] }, { final: [{ visibility: 'PUBLIC', isHidden: true }] }])('rejects revoked/deleted final state $final', async ({ final }) => {
    connection.db.command.mockResolvedValueOnce({ operationTime: stamp, cursor: { firstBatch: [{ visibility: 'PUBLIC' }] } })
      .mockResolvedValueOnce({ operationTime: stamp, cursor: { firstBatch: final } });
    await expect(service.findPublicOne(id.toString())).rejects.toMatchObject({ status: 404 });
    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('never falls back if a timestamp is missing', async () => {
    connection.db.command.mockResolvedValueOnce({ cursor: { firstBatch: [{ visibility: 'PUBLIC' }] } });
    await expect(service.findPublicOne(id.toString())).rejects.toMatchObject({ status: 503 });
    expect(connection.db.runCursorCommand).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it.each(['barrier', 'cursor', 'iteration', 'final'])('fails closed and cleans up after %s failure', async stage => {
    const failure = Object.assign(new Error('private database details'), { code: 50 });
    if (stage === 'barrier') connection.db.command.mockRejectedValueOnce(failure);
    if (stage === 'cursor') connection.db.runCursorCommand.mockImplementationOnce(() => { throw failure; });
    if (stage === 'iteration') cursor.toArray.mockRejectedValueOnce(failure);
    if (stage === 'final') connection.db.command.mockResolvedValueOnce({ operationTime: stamp, cursor: { firstBatch: [{ visibility: 'PUBLIC' }] } }).mockRejectedValueOnce(failure);
    await expect(service.findPublicOne(id.toString())).rejects.toMatchObject({ status: 503, message: 'Public itinerary data is temporarily unavailable. Please retry.' });
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(cursor.close).toHaveBeenCalledTimes(stage === 'iteration' || stage === 'final' ? 1 : 0);
  });
  it('uses one shared deadline rather than resetting it between reads', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    connection.db.command.mockImplementationOnce(async () => { now = 5001; return { operationTime: stamp, cursor: { firstBatch: [{ visibility: 'PUBLIC' }] } }; });
    await expect(service.findPublicOne(id.toString())).rejects.toMatchObject({ status: 503 });
    expect(connection.db.runCursorCommand).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('preserves cleanup when cursor closing fails', async () => {
    cursor.close.mockRejectedValueOnce(new Error('Close failed'));
    await expect(service.findPublicOne(id.toString())).rejects.toMatchObject({ status: 503 });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid IDs/pages before opening a session', async () => {
    await expect(service.findPublicOne('bad')).rejects.toMatchObject({ status: 400 });
    for (const page of [0, -1, 1.5, NaN, Infinity]) await expect(service.findPublic(page)).rejects.toMatchObject({ status: 400 });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
});

describe('ITN-21 public search filters', () => {
  const stamp = new mongo.Timestamp({ t: 10, i: 1 });
  let service: ItinerariesService;
  let connection: { getClient: jest.Mock; db: { command: jest.Mock; runCursorCommand: jest.Mock } };
  let cursor: { toArray: jest.Mock; close: jest.Mock };
  const pipelineFor = async (filters: Record<string, unknown>) => {
    await service.findPublic(1, filters);
    return connection.db.runCursorCommand.mock.calls[0][0].pipeline as Record<string, any>[];
  };
  beforeEach(() => {
    cursor = { toArray: jest.fn().mockResolvedValue([{ items: [], meta: [] }]), close: jest.fn().mockResolvedValue(undefined) };
    connection = { getClient: jest.fn().mockReturnValue({ startSession: () => ({ endSession: jest.fn() }) }), db: {
      command: jest.fn().mockResolvedValue({ operationTime: stamp, cursor: { firstBatch: [] } }),
      runCursorCommand: jest.fn().mockReturnValue(cursor),
    } };
    service = new ItinerariesService({ collection: { name: 'itineraries' } } as never, { collection: { name: 'countries' } } as never,
      { collection: { name: 'itinerarydays' } } as never, {} as never, {} as never, {} as never, connection as never, { collection: { name: 'cities' } } as never, {} as never);
  });

  it('keeps the plain discovery pipeline unchanged without filters', async () => {
    const pipeline = await pipelineFor({});
    expect(pipeline).toHaveLength(3);
    expect(Object.keys(pipeline[1])).toEqual(['$sort']);
  });

  it('filters by exact country code without looking up days', async () => {
    const pipeline = await pipelineFor({ country: 'EG' });
    expect(pipeline[1]).toEqual({ $match: { countryIds: 'EG' } });
    expect(JSON.stringify(pipeline)).not.toContain('searchDays');
  });

  it('filters by city code (exact, case-insensitive) and duration in days', async () => {
    const pipeline = await pipelineFor({ city: 'cairo', minDays: 2, maxDays: 5 });
    expect(pipeline[1].$lookup).toMatchObject({ from: 'itinerarydays', as: 'searchDays' });
    expect(pipeline).toContainEqual({ $match: { 'searchDays.cityId': { $regex: '^cairo$', $options: 'i' } } });
    expect(pipeline).toContainEqual({ $match: { $expr: { $and: [
      { $gte: [{ $size: '$searchDays' }, 2] }, { $lte: [{ $size: '$searchDays' }, 5] },
    ] } } });
    expect(pipeline).toContainEqual({ $project: { searchDays: 0, searchCountries: 0, searchCities: 0 } });
  });

  it('matches the keyword in title, country name/code and city name/code, with regex characters escaped', async () => {
    const pipeline = await pipelineFor({ keyword: 'egy.pt' });
    expect(pipeline).toContainEqual({ $lookup: { from: 'countries', localField: 'countryIds', foreignField: 'code', as: 'searchCountries' } });
    expect(pipeline).toContainEqual({ $lookup: { from: 'cities', localField: 'searchDays.cityId', foreignField: 'cityId', as: 'searchCities' } });
    const pattern = { $regex: 'egy\\.pt', $options: 'i' };
    expect(pipeline).toContainEqual({ $match: { $or: [
      { title: pattern }, { countryIds: pattern }, { 'searchCountries.name': pattern },
      { 'searchDays.cityId': pattern }, { 'searchCities.name': pattern },
    ] } });
  });

  it('rejects minDays greater than maxDays before reading the database', async () => {
    await expect(service.findPublic(1, { minDays: 5, maxDays: 2 })).rejects.toMatchObject({ status: 400 });
    expect(connection.getClient).not.toHaveBeenCalled();
  });
});
