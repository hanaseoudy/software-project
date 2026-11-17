import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AccountStatus, UserRole } from '../users/schemas/user.schema';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('AuthService.login lockout (ACC-05)', () => {
  const userModel = { findOne: jest.fn(), updateOne: jest.fn() };
  const sessionModel = { create: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  const service = new AuthService(
    userModel as any,
    {} as any,
    sessionModel as any,
    jwt as any,
    new ConfigService({ JWT_ACCESS_SECRET: 'access', JWT_REFRESH_SECRET: 'refresh' }),
  );

  const userId = new Types.ObjectId();
  const compare = bcrypt.compare as jest.Mock;
  const dto = { email: 'nour@example.com', password: 'Wrong1234' };
  const user = (overrides: object = {}) => ({
    _id: userId,
    email: 'nour@example.com',
    firstName: 'Nour',
    lastName: 'Hossam',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    passwordHash: 'hash',
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    ...overrides,
  });
  const found = (doc: object | null) => userModel.findOne.mockReturnValue({ select: () => Promise.resolve(doc) });

  beforeEach(() => {
    jest.resetAllMocks();
    found(user());
    compare.mockResolvedValue(false);
    userModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
    sessionModel.create.mockResolvedValue({ _id: new Types.ObjectId(), refreshJti: 'jti' });
    jwt.signAsync.mockResolvedValue('token');
  });

  it('counts a wrong password and returns the generic 401 before the 5th failure', async () => {
    await expect(service.login(dto)).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' });
    expect(userModel.updateOne).toHaveBeenCalledWith({ _id: userId }, { $inc: { failedLoginAttempts: 1 } });
  });

  it('locks the account for 15 minutes on the 5th failure and shows the lockout message right away', async () => {
    userModel.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 1 });
    const before = Date.now();

    const error = await service.login(dto).catch((e) => e);

    expect(error.getStatus()).toBe(423);
    expect(error.getResponse()).toMatchObject({
      message: 'Account locked after too many failed login attempts. Try again in 15 minute(s).',
      error: 'Locked',
    });
    const [filter, update] = userModel.updateOne.mock.calls[1];
    expect(filter).toEqual({ _id: userId, failedLoginAttempts: { $gte: 5 } });
    const lockedUntil: Date = update.$set.lockedUntil;
    expect(update.$set.failedLoginAttempts).toBe(0);
    expect(lockedUntil.getTime() - before).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
    expect(lockedUntil.getTime() - before).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it('rejects a locked account with 423 without checking the password', async () => {
    found(user({ lockedUntil: new Date(Date.now() + 10 * 60 * 1000) }));
    compare.mockResolvedValue(true);

    await expect(service.login(dto)).rejects.toMatchObject({ status: 423 });
    expect(compare).not.toHaveBeenCalled();
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('allows login again once the lock has expired, and resets the counter', async () => {
    found(user({ lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 0 }));
    compare.mockResolvedValue(true);

    await expect(service.login({ ...dto, password: 'Right1234' })).resolves.toMatchObject({ accessToken: 'token' });
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { failedLoginAttempts: 0, lockedUntil: null } },
    );
  });

  it('resets the counter after a successful login', async () => {
    found(user({ failedLoginAttempts: 3 }));
    compare.mockResolvedValue(true);

    await service.login({ ...dto, password: 'Right1234' });
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { failedLoginAttempts: 0, lockedUntil: null } },
    );
  });

  it('does not count failures for an email that does not exist', async () => {
    found(null);

    await expect(service.login(dto)).rejects.toMatchObject({ status: 401 });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});