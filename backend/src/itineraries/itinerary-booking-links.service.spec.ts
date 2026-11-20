import { Types } from 'mongoose';
import { ItineraryBookingLinksService } from './itinerary-booking-links.service';
describe('ITN-27 parent transaction protocol', () => {
  const parentId = new Types.ObjectId(),
    owner = new Types.ObjectId().toString();
  const error = (...labels: string[]) =>
    Object.assign(new Error('database failure'), {
      hasErrorLabel: (label: string) => labels.includes(label),
    });
  let session: {
      startTransaction: jest.Mock;
      commitTransaction: jest.Mock;
      abortTransaction: jest.Mock;
      endSession: jest.Mock;
      inTransaction: jest.Mock;
    },
    parent: { findOneAndUpdate: jest.Mock },
    service: ItineraryBookingLinksService;
  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
      inTransaction: jest.fn().mockReturnValue(true),
    };
    parent = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ lean: async () => ({ _id: parentId }) }),
    };
    service = new ItineraryBookingLinksService(
      parent as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { startSession: async () => session } as never,
    );
  });
  it('writes owned parent before child work and closes the session', async () => {
    const work = jest.fn().mockResolvedValue('ok');
    expect(await service['withParent'](owner, parentId, work)).toBe('ok');
    expect(parent.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: parentId, userId: new Types.ObjectId(owner) },
      { $inc: { __v: 1 } },
      { session },
    );
    expect(parent.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      work.mock.invocationCallOrder[0],
    );
    expect(session.endSession).toHaveBeenCalled();
  });
  it('rejects missing owned parent before child work', async () => {
    parent.findOneAndUpdate.mockReturnValue({ lean: async () => null });
    const work = jest.fn();
    await expect(
      service['withParent'](owner, parentId, work),
    ).rejects.toMatchObject({ status: 404 });
    expect(work).not.toHaveBeenCalled();
  });
  it('rolls back nonretryable failures without replay', async () => {
    const work = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(service['withParent'](owner, parentId, work)).rejects.toThrow(
      'fail',
    );
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });
  it('retries transient body failures and bounds conflicts', async () => {
    const work = jest
      .fn()
      .mockRejectedValue(error('TransientTransactionError'));
    await expect(
      service['withParent'](owner, parentId, work),
    ).rejects.toMatchObject({ status: 409 });
    expect(work).toHaveBeenCalledTimes(5);
  });
  it('retries only commit when both error labels appear', async () => {
    session.commitTransaction.mockRejectedValueOnce(
      error('UnknownTransactionCommitResult', 'TransientTransactionError'),
    );
    const work = jest.fn().mockResolvedValue('ok');
    expect(await service['withParent'](owner, parentId, work)).toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(2);
  });
  it('bounds uncertain commits without replay or abort', async () => {
    session.commitTransaction.mockRejectedValue(
      error('UnknownTransactionCommitResult'),
    );
    const work = jest.fn();
    await expect(
      service['withParent'](owner, parentId, work),
    ).rejects.toMatchObject({ status: 503 });
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(5);
    expect(session.abortTransaction).not.toHaveBeenCalled();
  });
  it('rejects malformed IDs before any database access', async () => {
    await expect(service.list(owner, 'bad')).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.remove(owner, parentId.toString(), 'bad'),
    ).rejects.toMatchObject({ status: 400 });
    expect(parent.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects case-variant duplicate ObjectIds before parent writes', async () => {
    const day = '6aff000000000000000000ab';
    await expect(
      service.create(owner, parentId.toString(), {
        bookingType: 'flight' as never,
        bookingId: parentId.toString(),
        dayIds: [day, day.toUpperCase()],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(parent.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
