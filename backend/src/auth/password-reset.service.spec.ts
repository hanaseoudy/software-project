import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { FORGOT_PASSWORD_REPLY, PASSWORD_RESET_TTL_MS, PasswordResetService } from './password-reset.service';
import { AccountStatus } from '../users/schemas/user.schema';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('PasswordResetService (ACC-07)', () => {
  const userModel = { findOneAndUpdate: jest.fn() };
  const sessionModel = { updateMany: jest.fn() };
  const mail = { send: jest.fn(), appUrl: 'http://localhost:3001' };
  const service = new PasswordResetService(userModel as any, sessionModel as any, mail as any);

  const id = new Types.ObjectId();
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const withUpdatedUser = (value: unknown) =>
    userModel.findOneAndUpdate.mockReturnValue({ select: () => Promise.resolve(value) });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.resetAllMocks();
    mail.appUrl = 'http://localhost:3001';
    mail.send.mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
  });

  describe('requestReset', () => {
    it('stores only the hash of a new 30-minute token and emails the link', async () => {
      withUpdatedUser({ _id: id, email: 'nour@example.com', firstName: 'Nour' });
      const before = Date.now();

      await expect(service.requestReset('nour@example.com')).resolves.toEqual(FORGOT_PASSWORD_REPLY);
      await flush();

      const [filter, update] = userModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ email: 'nour@example.com', status: AccountStatus.ACTIVE });
      const message = mail.send.mock.calls[0][0];
      const token = new URL(message.action.url).searchParams.get('token')!;
      expect(message.to).toBe('nour@example.com');
      expect(message.action.url).toBe(`http://localhost:3001/reset-password?token=${token}`);
      expect(update.$set.passwordResetTokenHash).toBe(sha256(token));
      const ttl = update.$set.passwordResetExpiresAt.getTime() - before;
      expect(ttl).toBeGreaterThanOrEqual(PASSWORD_RESET_TTL_MS - 1000);
      expect(ttl).toBeLessThanOrEqual(PASSWORD_RESET_TTL_MS + 1000);
    });

    it('gives the same reply and sends nothing for an unknown email', async () => {
      withUpdatedUser(null);
      await expect(service.requestReset('nobody@example.com')).resolves.toEqual(FORGOT_PASSWORD_REPLY);
      await flush();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('a newer request stores a new token, so the older link stops working', async () => {
      withUpdatedUser({ _id: id, email: 'nour@example.com', firstName: 'Nour' });
      await service.requestReset('nour@example.com');
      await service.requestReset('nour@example.com');
      const first = userModel.findOneAndUpdate.mock.calls[0][1].$set.passwordResetTokenHash;
      const second = userModel.findOneAndUpdate.mock.calls[1][1].$set.passwordResetTokenHash;
      expect(second).not.toBe(first);
    });

    it('still gives the same reply if the email fails', async () => {
      withUpdatedUser({ _id: id, email: 'nour@example.com', firstName: 'Nour' });
      mail.send.mockRejectedValue(new Error('smtp down'));
      await expect(service.requestReset('nour@example.com')).resolves.toEqual(FORGOT_PASSWORD_REPLY);
      await flush();
    });
  });

  describe('resetPassword', () => {
    it('saves the new password, removes the token so the link works once, and logs out every session', async () => {
      userModel.findOneAndUpdate.mockResolvedValue({ _id: id });

      await expect(service.resetPassword('abc', 'NewPass123')).resolves.toEqual({
        message: 'Password reset. You can now log in with your new password.',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123', 10);
      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          passwordResetTokenHash: sha256('abc'),
          passwordResetExpiresAt: { $gt: expect.any(Date) },
          status: AccountStatus.ACTIVE,
        },
        {
          $set: { passwordHash: 'new-hash', mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
          $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' },
        },
      );
      expect(sessionModel.updateMany).toHaveBeenCalledWith(
        { user: id, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } },
      );
    });

    it('rejects a wrong, used, replaced or expired token and changes nothing', async () => {
      userModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.resetPassword('abc', 'NewPass123')).rejects.toThrow(
        new BadRequestException('This reset link is invalid or has expired'),
      );
      expect(sessionModel.updateMany).not.toHaveBeenCalled();
    });
  });
});