import { Types } from 'mongoose';
import { BudgetEntriesService } from './budget-entries.service';
import { BudgetCategory, BudgetEntry } from './schemas/budget-entry.schema';

describe('ITN-14 validation and transaction policy', () => {
  const id = new Types.ObjectId(),
    owner = new Types.ObjectId().toString();
  let service: BudgetEntriesService;
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let connection: { startSession: jest.Mock },
    parent: { findOneAndUpdate: jest.Mock };
  let currencies: { exists: jest.Mock };
  const labelled = (...labels: string[]) =>
    Object.assign(new Error('Database error'), {
      hasErrorLabel: (label: string) => labels.includes(label),
    });
  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    parent = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: id }) }),
    };
    const supported = () => ({
      session: jest.fn().mockResolvedValue({ _id: id }),
    });
    currencies = { exists: jest.fn(supported) };
    service = new BudgetEntriesService(
      parent as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      currencies as never,
      connection as never,
      { aggregationExpenses: async () => ({ $literal: [] }), removeForDays: async () => undefined, removeForItinerary: async () => undefined } as never,
    );
  });
  const record = (): BudgetEntry => ({
    dayId: id,
    category: BudgetCategory.FOOD,
    amount: 0,
    currency: 'USD',
  });
  it('rejects malformed route IDs, target days and empty PATCH before database access', async () => {
    await expect(
      service.create(owner, 'bad', id.toString(), record()),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(owner, id.toString(), 'bad', record()),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.update(owner, id.toString(), {}),
    ).rejects.toMatchObject({ status: 400 });

    await expect(service.remove(owner, 'bad')).rejects.toMatchObject({
      status: 400,
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('writes the owned parent before invoking any authoritative child work', async () => {
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).resolves.toBe('ok');
    expect(parent.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, userId: new Types.ObjectId(owner) },
      { $inc: { __v: 1 } },
      { session },
    );
    expect(parent.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      work.mock.invocationCallOrder[0],
    );
    parent.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    work.mockClear();
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 404,
    });
    expect(work).not.toHaveBeenCalled();
  });
  it('accepts zero amount', async () => {
    await expect(
      service['validateRecord'](record(), session as never),
    ).resolves.toBeUndefined();
    expect(currencies.exists).toHaveBeenCalledWith({ code: 'USD' });
  });
  it.each([
    { category: 'INVALID' },
    { amount: -1 },
    { amount: 0.001 },
    { amount: Infinity },
    { amount: '1' },
    { description: null },
  ])('validates the complete resulting record: %j', async (changes) => {
    await expect(
      service['validateRecord'](
        { ...record(), ...changes } as BudgetEntry,
        session as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('requires a supported currency', async () => {
    currencies.exists.mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service['validateRecord'](record(), session as never),
    ).rejects.toMatchObject({
      response: { errors: { currency: expect.any(Array) } },
    });
  });
  it('bounds transient callback failures with HTTP 409', async () => {
    const work = jest
      .fn()
      .mockRejectedValue(labelled('TransientTransactionError'));
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 409,
    });
    expect(work).toHaveBeenCalledTimes(5);
    expect(session.endSession).toHaveBeenCalledTimes(5);
  });
  it('recovers from a transient callback failure', async () => {
    const work = jest
      .fn()
      .mockRejectedValueOnce(labelled('TransientTransactionError'))
      .mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });
  it('prioritizes uncertainty with both labels and retries only commit', async () => {
    session.commitTransaction
      .mockRejectedValueOnce(
        labelled('UnknownTransactionCommitResult', 'TransientTransactionError'),
      )
      .mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(3);
    expect(session.abortTransaction).not.toHaveBeenCalled();
  });
  it('restarts after uncertainty becomes a definitive transient failure', async () => {
    session.commitTransaction
      .mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'))
      .mockRejectedValueOnce(labelled('TransientTransactionError'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
    expect(session.commitTransaction).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['UnknownTransactionCommitResult'],
    ['UnknownTransactionCommitResult', 'TransientTransactionError'],
  ])('bounds repeated uncertain commits: %j', async (...labels) => {
    session.commitTransaction.mockRejectedValue(labelled(...labels));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 503,
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(5);
  });
  it('bounds definite transient commit failures', async () => {
    session.commitTransaction.mockRejectedValue(
      labelled('TransientTransactionError'),
    );
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 409,
    });
    expect(work).toHaveBeenCalledTimes(5);
  });
  it('bounds alternating uncertainty and definitive transient failures', async () => {
    let commits = 0;
    session.commitTransaction.mockImplementation(async () => {
      throw labelled(
        ++commits % 2
          ? 'UnknownTransactionCommitResult'
          : 'TransientTransactionError',
      );
    });
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 409,
    });
    expect(work).toHaveBeenCalledTimes(5);
    expect(session.commitTransaction).toHaveBeenCalledTimes(10);
  });
  it('does not replay non-retryable errors or duplicate-key failures', async () => {
    const error = Object.assign(new Error('duplicate'), { code: 11000 }),
      work = jest.fn().mockRejectedValue(error);
    await expect(service['withParent'](owner, id, work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
  it('does not replay an uncertain commit followed by a non-retryable error', async () => {
    const error = new Error('Non-retryable');
    session.commitTransaction
      .mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'))
      .mockRejectedValueOnce(error);
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  });
  it('uses a read-only snapshot, returns 404 for nonowners and always releases it', async () => {
    const query = {
      session: jest.fn().mockReturnThis(),
      read: jest.fn().mockReturnThis(),
      maxTimeMS: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    };
    Object.assign(parent, { findOne: jest.fn().mockReturnValue(query) });
    const work = jest.fn();
    await expect(
      service['readOwned'](owner, id.toString(), work),
    ).rejects.toMatchObject({ status: 404 });
    expect(connection.startSession).toHaveBeenCalledWith({
      snapshot: true,
      causalConsistency: false,
    });
    expect(work).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(parent.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it.each([50, 239, 246])(
    'fails closed and releases snapshot on database code %s',
    async (code) => {
      const query = {
        session: jest.fn().mockReturnThis(),
        read: jest.fn().mockReturnThis(),
        maxTimeMS: jest.fn().mockReturnThis(),
        lean: jest
          .fn()
          .mockRejectedValue(Object.assign(new Error('Unavailable'), { code })),
      };
      Object.assign(parent, { findOne: jest.fn().mockReturnValue(query) });
      await expect(service.totals(owner, id.toString())).rejects.toMatchObject({
        status: 503,
      });
      expect(session.endSession).toHaveBeenCalledTimes(1);
    },
  );
});
