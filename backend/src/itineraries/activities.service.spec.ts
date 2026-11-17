import { Types } from 'mongoose';
import { ActivitiesService } from './activities.service';

describe('ITN-10 service transaction and currency rules', () => {
  const id = new Types.ObjectId(),
    owner = new Types.ObjectId().toString();
  let service: ActivitiesService;
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let currencies: { exists: jest.Mock };
  let parents: { findOneAndUpdate: jest.Mock };
  const labelled = (...labels: string[]) =>
    Object.assign(new Error('Conflict'), {
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
    currencies = {
      exists: jest
        .fn()
        .mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: id }) }),
    };
    parents = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: id }) }),
    };
    service = new ActivitiesService(
      parents as never,
      {} as never,
      {} as never,
      currencies as never,
      connection as never,
    );
  });
  it('rejects malformed IDs and empty PATCH before database access', async () => {
    await expect(
      service.create(owner, 'bad', id.toString(), {
        name: 'n',
        description: 'd',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(owner, id.toString(), 'bad', {
        name: 'n',
        description: 'd',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.update(owner, id.toString(), {}),
    ).rejects.toMatchObject({ status: 400 });
    await expect(service.remove(owner, 'bad')).rejects.toMatchObject({
      status: 400,
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('does not authorize children when the parent owner filter fails', async () => {
    parents.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    const work = jest.fn();
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 404,
    });
    expect(work).not.toHaveBeenCalled();
    expect(parents.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, userId: new Types.ObjectId(owner) },
      { $inc: { __v: 1 } },
      { session },
    );
  });
  it('requires currency even for zero and rejects orphan currency', async () => {
    await expect(
      service['currencyFor'](0, undefined, session as never),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service['currencyFor'](undefined, 'USD', session as never),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service['currencyFor'](0, 'USD', session as never),
    ).resolves.toBeUndefined();
    await expect(
      service['currencyFor'](undefined, undefined, session as never),
    ).resolves.toBeUndefined();
    currencies.exists.mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service['currencyFor'](1, 'ZZZ', session as never),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('bounds transient retries and maps exhaustion to 409', async () => {
    const work = jest
      .fn()
      .mockRejectedValue(labelled('TransientTransactionError'));
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 409,
    });
    expect(work).toHaveBeenCalledTimes(5);
    expect(session.endSession).toHaveBeenCalledTimes(5);
  });
  it('retries commit only on uncertainty, including both labels', async () => {
    session.commitTransaction.mockRejectedValueOnce(
      labelled('UnknownTransactionCommitResult', 'TransientTransactionError'),
    );
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(2);
  });
  it('restarts after uncertainty becomes a definitive transient failure', async () => {
    session.commitTransaction
      .mockRejectedValueOnce(labelled('UnknownTransactionCommitResult'))
      .mockRejectedValueOnce(labelled('TransientTransactionError'));
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });
  it('bounds ambiguous commits without replaying the callback', async () => {
    session.commitTransaction.mockRejectedValue(
      labelled('UnknownTransactionCommitResult'),
    );
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service['withParent'](owner, id, work)).rejects.toMatchObject({
      status: 503,
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(5);
  });
  it('aborts non-retryable failures without replay', async () => {
    const error = new Error('Database failure'),
      work = jest.fn().mockRejectedValue(error);
    await expect(service['withParent'](owner, id, work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
});
