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
