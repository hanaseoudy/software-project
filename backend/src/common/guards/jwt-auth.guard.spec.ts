import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionDocument } from '../../auth/schemas/session.schema';
import { AccountStatus, UserDocument, UserRole } from '../../users/schemas/user.schema';

describe('JwtAuthGuard', () => {
  const jwt = { verifyAsync: jest.fn() };
  const sessions = { findOneAndUpdate: jest.fn(), updateOne: jest.fn() };
  const users = { findById: jest.fn() };
  const guard = new JwtAuthGuard(jwt as unknown as JwtService, new ConfigService({ JWT_ACCESS_SECRET: 'test' }), sessions as unknown as Model<SessionDocument>, users as unknown as Model<UserDocument>);
  const req: { cookies: Record<string, string>; user?: { role: string } } = { cookies: {} };
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
  beforeEach(() => {
    jest.resetAllMocks();
    req.cookies = { access_token: 'token' };
    delete req.user;
    jwt.verifyAsync.mockResolvedValue({ sub: 'user', sid: 'session', role: UserRole.ADMIN });
    sessions.findOneAndUpdate.mockResolvedValue({ _id: 'session' });
    users.findById.mockReturnValue({ select: () => ({ lean: async () => ({ status: AccountStatus.ACTIVE, role: UserRole.USER }) }) });
  });
  it('uses the current database role and checks both expiry and inactivity', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user?.role).toBe(UserRole.USER);
    expect(sessions.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ expiresAt: { $gt: expect.any(Date) }, lastActivityAt: { $gt: expect.any(Date) }, revokedAt: null });
  });
  it('rejects a missing cookie without querying sessions', async () => {
    req.cookies = {};
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    expect(sessions.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects a missing, revoked, idle or expired session', async () => {
    sessions.findOneAndUpdate.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
  });
  it.each([AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED])('revokes a %s account session', async (status) => {
    users.findById.mockReturnValue({ select: () => ({ lean: async () => ({ status, role: UserRole.USER }) }) });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    expect(sessions.updateOne).toHaveBeenCalledWith({ _id: 'session' }, { $set: { revokedAt: expect.any(Date) } });
  });
});
