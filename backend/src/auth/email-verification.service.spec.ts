import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { EMAIL_VERIFICATION_TTL_MS, EmailVerificationService } from './email-verification.service';
import { AccountStatus } from '../users/schemas/user.schema';

describe('EmailVerificationService (ACC-02)', () => {
  const userModel = { findOneAndUpdate: jest.fn(), findById: jest.fn() };
  const mail = { send: jest.fn(), appUrl: 'http://localhost:3001' };
  const service = new EmailVerificationService(userModel as any, mail as any);

  const id = new Types.ObjectId();
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const withUpdatedUser = (value: unknown) =>
    userModel.findOneAndUpdate.mockReturnValue({ select: () => Promise.resolve(value) });

  beforeEach(() => {
    jest.resetAllMocks();
    mail.appUrl = 'http://localhost:3001';
    withUpdatedUser({ _id: id, email: 'nour@example.com', firstName: 'Nour' });
    mail.send.mockResolvedValue(true);
  });

  describe('sendVerificationEmail', () => {
    it('stores only the hash of a new token and emails the link', async () => {
      const before = Date.now();
      await expect(service.sendVerificationEmail(id)).resolves.toBe(true);

      const [filter, update] = userModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: id, emailVerified: false });
      const message = mail.send.mock.calls[0][0];
      const token = new URL(message.action.url).searchParams.get('token')!;
      expect(message.to).toBe('nour@example.com');
      expect(message.action.url).toBe(`http://localhost:3001/verify-email?token=${token}`);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(update.$set.emailVerificationTokenHash).toBe(sha256(token));
      expect(update.$set.emailVerificationTokenHash).not.toBe(token);
      expect(update.$set.emailVerificationExpiresAt.getTime() - before).toBeGreaterThanOrEqual(EMAIL_VERIFICATION_TTL_MS - 1000);
    });

    it('sends nothing to an account that is already verified', async () => {
      withUpdatedUser(null);
      await expect(service.sendVerificationEmail(id)).resolves.toBe(false);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('never throws, so registration is not affected', async () => {
      userModel.findOneAndUpdate.mockImplementation(() => {
        throw new Error('db down');
      });
      await expect(service.sendVerificationEmail(id)).resolves.toBe(false);
    });
  });

  describe('verify', () => {
    it('verifies the email and removes the token so the link works once', async () => {
      userModel.findOneAndUpdate.mockResolvedValue({ _id: id });
      await expect(service.verify('abc')).resolves.toEqual({ message: 'Email verified' });
      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        { emailVerificationTokenHash: sha256('abc'), emailVerificationExpiresAt: { $gt: expect.any(Date) } },
        {
          $set: { emailVerified: true },
          $unset: { emailVerificationTokenHash: '', emailVerificationExpiresAt: '' },
        },
      );
    });

    it('rejects a wrong, used or expired token', async () => {
      userModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.verify('abc')).rejects.toThrow(
        new BadRequestException('This verification link is invalid or has expired'),
      );
    });
  });

  describe('resend', () => {
    const withUser = (value: unknown) => userModel.findById.mockReturnValue({ select: () => Promise.resolve(value) });

    it('sends a new link to an unverified user', async () => {
      withUser({ _id: id, status: AccountStatus.ACTIVE, emailVerified: false });
      await expect(service.resend(id.toString())).resolves.toEqual({ message: 'Verification email sent' });
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it.each([true, undefined])('returns 409 when the email is already verified (%s)', async (emailVerified) => {
      withUser({ _id: id, status: AccountStatus.ACTIVE, emailVerified });
      await expect(service.resend(id.toString())).rejects.toBeInstanceOf(ConflictException);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('returns 401 for a missing or inactive account', async () => {
      withUser(null);
      await expect(service.resend(id.toString())).rejects.toBeInstanceOf(UnauthorizedException);
      withUser({ _id: id, status: AccountStatus.SUSPENDED, emailVerified: false });
      await expect(service.resend(id.toString())).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});