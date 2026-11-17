import { Types } from 'mongoose';
import { NotificationType } from './enums/notification.enums';
import { NotificationsService } from './notifications.service';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(users: Array<{ _id: Types.ObjectId; email: string; firstName: string }> = []) {
  const notificationModel = {
    create: jest.fn(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc })),
    insertMany: jest.fn(async (docs: any[]) => docs),
  };
  const userModel = {
    find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(users) }) })),
  };
  const mail = { sendNotification: jest.fn().mockResolvedValue(true) };
  const service = new NotificationsService(notificationModel as any, userModel as any, mail as any);
  return { service, notificationModel, userModel, mail };
}

const input = {
  type: NotificationType.BOOKING_CONFIRMED,
  title: 'Booking confirmed',
  message: 'Your booking FB-1 is confirmed.',
};

describe('NotificationsService email (GEN-01-B)', () => {
  it('saves the in-app notification and emails the same title and message to the user', async () => {
    const userId = new Types.ObjectId();
    const { service, notificationModel, mail } = setup([{ _id: userId, email: 'sara@test.com', firstName: 'Sara' }]);

    await service.create(userId, input);
    await flush();

    expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({ user: userId, ...input }));
    expect(mail.sendNotification).toHaveBeenCalledWith(
      'sara@test.com',
      'Sara',
      'Booking confirmed',
      'Your booking FB-1 is confirmed.',
    );
  });

  it.each(Object.values(NotificationType))('emails %s notifications', async (type) => {
    const userId = new Types.ObjectId();
    const { service, mail } = setup([{ _id: userId, email: 'u@test.com', firstName: 'U' }]);

    await service.create(userId, { ...input, type });
    await flush();

    expect(mail.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('emails every user once for a notification sent to many users (e.g. flight schedule change)', async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const { service, userModel, mail } = setup([
      { _id: a, email: 'a@test.com', firstName: 'A' },
      { _id: b, email: 'b@test.com', firstName: 'B' },
    ]);

    await service.createForMany([a, b, a.toString()], { ...input, type: NotificationType.FLIGHT_SCHEDULE_CHANGED });
    await flush();

    const ids = (userModel.find.mock.calls[0] as any)[0]._id.$in.map(String);
    expect(ids).toEqual([a.toString(), b.toString()]);
    expect(mail.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('keeps the in-app notification when the email fails', async () => {
    const userId = new Types.ObjectId();
    const { service, mail } = setup([{ _id: userId, email: 'u@test.com', firstName: 'U' }]);
    mail.sendNotification.mockRejectedValue(new Error('SMTP down'));

    const notification = await service.create(userId, input);
    await flush();

    expect(notification).toEqual(expect.objectContaining({ user: userId, title: 'Booking confirmed' }));
  });

  it('does not wait for the email before returning', async () => {
    const userId = new Types.ObjectId();
    const { service, mail } = setup([{ _id: userId, email: 'u@test.com', firstName: 'U' }]);
    mail.sendNotification.mockReturnValue(new Promise(() => undefined)); // never finishes

    await expect(service.create(userId, input)).resolves.toBeDefined();
  });

  it('sends no email when the user no longer exists', async () => {
    const { service, mail } = setup([]);
    await service.create(new Types.ObjectId(), input);
    await flush();
    expect(mail.sendNotification).not.toHaveBeenCalled();
  });

  it('sends nothing for an empty list of users', async () => {
    const { service, notificationModel, mail } = setup([]);
    expect(await service.createForMany([], input)).toEqual([]);
    expect(notificationModel.insertMany).not.toHaveBeenCalled();
    expect(mail.sendNotification).not.toHaveBeenCalled();
  });
});
