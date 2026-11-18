import { Types } from 'mongoose';
import { ActivitiesService } from './activities.service';
import { ImageCategory } from '../uploads/uploads.constants';
import { UploadsService } from '../uploads/uploads.service';
import { Logger } from '@nestjs/common';

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
  let parents: { findOneAndUpdate: jest.Mock; exists: jest.Mock };
  let days: { findById: jest.Mock; exists: jest.Mock };
  let activities: {
    findById: jest.Mock;
    findOne: jest.Mock;
    exists: jest.Mock;
  };
  let uploads: UploadsService;
  const url = '/api/uploads/activity/680329ed-1150-49a5-b035-b0b7ef86424f.png';
  const image = {
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: 3,
    buffer: Buffer.from('bad'),
  };
  const query = (value: unknown) => ({
    select: () => ({ lean: async () => value }),
    session: async () => value,
  });
  let activity: {
    _id: Types.ObjectId;
    dayId: Types.ObjectId;
    name: string;
    description: string;
    images: string[];
    save: jest.Mock;
  };
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
      exists: jest.fn().mockResolvedValue({ _id: id }),
    };
    days = {
      exists: jest.fn().mockReturnValue(query({ _id: id })),
      findById: jest.fn().mockReturnValue(query({ itineraryId: id })),
    };
    activity = {
      _id: id,
      dayId: id,
      name: 'Museum',
      description: 'Visit',
      images: [],
      save: jest.fn(),
    };
    activities = {
      findById: jest.fn().mockReturnValue(query(activity)),
      findOne: jest.fn().mockReturnValue(query(activity)),
      exists: jest
        .fn()
        .mockReturnValue({ read: () => ({ readConcern: async () => null }) }),
    };
    uploads = new UploadsService();
    jest.spyOn(uploads, 'saveImages').mockResolvedValue([url]);
    jest.spyOn(uploads, 'deleteByUrl').mockResolvedValue(undefined);
    service = new ActivitiesService(
      parents as never,
      days as never,
      activities as never,
      currencies as never,
      connection as never,
      uploads,
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

  it('adds a fifth image without replacing existing references', async () => {
    activity.images = ['one', 'two', 'three', 'four'];
    await expect(
      service.addImage(owner, id.toString(), image),
    ).resolves.toEqual({ url });
    expect(activity.images).toEqual(['one', 'two', 'three', 'four', url]);
    expect(activity.save).toHaveBeenCalledWith({ session });
    expect(uploads.saveImages).toHaveBeenCalledWith(
      [image],
      ImageCategory.ACTIVITY,
    );
    await expect(
      service.addImage(owner, id.toString(), image),
    ).rejects.toMatchObject({ status: 400 });
    expect(uploads.saveImages).toHaveBeenCalledTimes(1);
  });

  it('rechecks the count after a write conflict when another upload takes the final slot', async () => {
    const existing = ['one', 'two', 'three', 'four'];
    activity.images = [...existing];
    activity.save.mockRejectedValueOnce(labelled('TransientTransactionError'));
    activities.findOne
      .mockReturnValueOnce(query(activity))
      .mockReturnValueOnce(
        query({ ...activity, images: [...existing, 'winner'] }),
      );
    await expect(
      service.addImage(owner, id.toString(), image),
    ).rejects.toMatchObject({ status: 400 });
    expect(connection.startSession).toHaveBeenCalledTimes(2);
    expect(uploads.saveImages).toHaveBeenCalledTimes(1);
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(url);
  });

  it('reuses the uploaded file when a retry still has capacity', async () => {
    activity.save.mockRejectedValueOnce(labelled('TransientTransactionError'));
    activities.findOne
      .mockReturnValueOnce(query(activity))
      .mockReturnValueOnce(query({ ...activity, images: ['winner'] }));
    await expect(
      service.addImage(owner, id.toString(), image),
    ).resolves.toEqual({ url });
    expect(uploads.saveImages).toHaveBeenCalledTimes(1);
    expect(uploads.deleteByUrl).not.toHaveBeenCalled();
  });

  it('cleans up an uploaded file after a definitive save failure', async () => {
    activity.save.mockRejectedValueOnce(new Error('write failed'));
    await expect(service.addImage(owner, id.toString(), image)).rejects.toThrow(
      'write failed',
    );
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(url);
  });

  it('keeps uploaded bytes when commit remains uncertain', async () => {
    session.commitTransaction.mockRejectedValue(
      labelled('UnknownTransactionCommitResult'),
    );
    await expect(
      service.addImage(owner, id.toString(), image),
    ).rejects.toMatchObject({ status: 503 });
    expect(uploads.deleteByUrl).not.toHaveBeenCalled();
  });

  it('commits reference removal before deleting the file and returns remaining images', async () => {
    activity.images = ['legacy', url];
    jest.mocked(uploads.deleteByUrl).mockImplementationOnce(async () => {
      expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    });
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).resolves.toMatchObject({ images: ['legacy'] });
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(url);
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).rejects.toMatchObject({ status: 404 });
    expect(uploads.deleteByUrl).toHaveBeenCalledTimes(1);
  });

  it('keeps the file when removal fails or its commit is uncertain', async () => {
    activity.images = [url];
    activity.save.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).rejects.toThrow('write failed');
    activity.images = [url];
    session.commitTransaction.mockRejectedValue(
      labelled('UnknownTransactionCommitResult'),
    );
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).rejects.toMatchObject({ status: 503 });
    expect(uploads.deleteByUrl).not.toHaveBeenCalled();
  });

  it('logs failed physical cleanup after the reference has committed', async () => {
    activity.images = [url];
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      jest
        .mocked(uploads.deleteByUrl)
        .mockRejectedValueOnce(new Error('unlink failed'));
      await expect(
        service.removeImage(owner, id.toString(), url),
      ).resolves.toMatchObject({ images: [] });
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(url),
        expect.any(Error),
      );
    } finally {
      log.mockRestore();
    }
  });

  it('detaches legacy URLs and preserves files used by other activities', async () => {
    const legacy = '/api/uploads/post/680329ed-1150-49a5-b035-b0b7ef86424f.png';
    activity.images = [url, legacy];
    activities.exists.mockReturnValue({
      read: () => ({ readConcern: async () => ({ _id: id }) }),
    });
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).resolves.toMatchObject({ images: [legacy] });
    await expect(
      service.removeImage(owner, id.toString(), legacy),
    ).resolves.toMatchObject({ images: [] });
    expect(activities.exists).toHaveBeenCalledTimes(1);
    expect(uploads.deleteByUrl).not.toHaveBeenCalled();
  });

  it('rejects a missing activity, an unrelated attachment and an unowned activity', async () => {
    activities.findById.mockReturnValueOnce(query(null));
    await expect(
      service.addImage(owner, id.toString(), image),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).rejects.toMatchObject({ status: 404 });
    activity.images = [url];
    parents.findOneAndUpdate.mockReturnValue({ lean: async () => null });
    await expect(
      service.removeImage(owner, id.toString(), url),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.addImage(owner, id.toString(), image),
    ).rejects.toMatchObject({ status: 404 });
    parents.exists.mockResolvedValueOnce(null);
    await expect(service.findOne(owner, id.toString())).rejects.toMatchObject({
      status: 404,
    });
    expect(uploads.saveImages).not.toHaveBeenCalled();
    expect(uploads.deleteByUrl).not.toHaveBeenCalled();
  });

  it('rejects missing and malformed content through GEN-08', async () => {
    jest.mocked(uploads.saveImages).mockRestore();
    await expect(
      service.addImage(owner, id.toString(), undefined),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.addImage(owner, id.toString(), image),
    ).rejects.toMatchObject({ status: 400 });
    expect(activity.save).not.toHaveBeenCalled();
  });

  it('returns existing image URLs through reads and preserves them through ITN-10 edits', async () => {
    activity.images = [url];
    activities.findOne.mockReturnValueOnce(activity);
    await expect(service.findOne(owner, id.toString())).resolves.toMatchObject({
      images: [url],
    });
    await expect(
      service.update(owner, id.toString(), { name: 'Other' }),
    ).resolves.toMatchObject({
      name: 'Other',
      images: [url],
    });
  });
});
