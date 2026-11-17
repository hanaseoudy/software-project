import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ItinerariesService } from './itineraries.service';

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
    service = new ItinerariesService(parent as never, {} as never, {} as never, {} as never, {} as never, {} as never, connection as never, {} as never);
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
      connection as never, cityModel as never);
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
