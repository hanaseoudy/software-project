import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AccountStatus } from '../users/schemas/user.schema';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('AuthService.changePassword (ACC-08)', () => {
  const select = jest.fn();
  const userModel = { findById: jest.fn(() => ({ select })), updateOne: jest.fn() };
  const sessionModel = { updateMany: jest.fn() };
  const service = new AuthService(userModel as any, {} as any, sessionModel as any, {} as any, new ConfigService({}));

  const userId = new Types.ObjectId();
  const sessionId = new Types.ObjectId().toString();
  const compare = bcrypt.compare as jest.Mock;
  const dto = { currentPassword: 'Temp1234', newPassword: 'NewPass123' };

  beforeEach(() => {
    jest.clearAllMocks();
    select.mockResolvedValue({ _id: userId, status: AccountStatus.ACTIVE, passwordHash: 'old-hash' });
    compare.mockImplementation(async (plain: string) => plain === 'Temp1234');
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
  });

  it('saves the new hashed password and clears mustChangePassword', async () => {
    await expect(service.changePassword(userId.toString(), sessionId, dto)).resolves.toEqual({
      message: 'Password changed',
    });

    expect(userModel.findById).toHaveBeenCalledWith(userId.toString());
    expect(select).toHaveBeenCalledWith('+passwordHash');
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123', 10);
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { passwordHash: 'new-hash', mustChangePassword: false } },
    );
  });

  it('logs out the other sessions but keeps the current one', async () => {
    await service.changePassword(userId.toString(), sessionId, dto);

    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { user: userId, _id: { $ne: sessionId }, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });

  it('rejects a wrong current password and changes nothing', async () => {
    const error = await service
      .changePassword(userId.toString(), sessionId, { ...dto, currentPassword: 'Wrong1234' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      message: 'Validation failed',
      errors: { currentPassword: ['Current password is incorrect'] },
    });
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a new password that is the same as the current one', async () => {
    const error = await service
      .changePassword(userId.toString(), sessionId, { currentPassword: 'Temp1234', newPassword: 'Temp1234' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      message: 'Validation failed',
      errors: { newPassword: ['New password must be different from the current password'] },
    });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a user that no longer exists with 401', async () => {
    select.mockResolvedValue(null);

    await expect(service.changePassword(userId.toString(), sessionId, dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a suspended account with 401', async () => {
    select.mockResolvedValue({ _id: userId, status: AccountStatus.SUSPENDED, passwordHash: 'old-hash' });

    await expect(service.changePassword(userId.toString(), sessionId, dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});