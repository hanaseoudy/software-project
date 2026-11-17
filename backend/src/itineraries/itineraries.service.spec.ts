import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ItinerariesService } from './itineraries.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderItineraryDayDto } from './dto/reorder-itinerary-day.dto';

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
    service = new ItinerariesService(parentModel as never, {} as never, model as never, {} as never, {} as never, {} as never, { startSession: async () => session } as never, {} as never);
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
