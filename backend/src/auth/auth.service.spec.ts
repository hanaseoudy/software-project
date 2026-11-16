import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { AuthService } from './auth.service';
import { SessionDocument } from './schemas/session.schema';
import { UserDocument, AccountStatus, UserRole } from '../users/schemas/user.schema';
import { ModeratorAssignmentDocument } from '../users/schemas/moderatorassignment.schema';

describe('AuthService refresh regression', () => {
  const users = { findById: jest.fn() };
  const sessions = { findOneAndUpdate: jest.fn(), updateOne: jest.fn() };
  const jwt = { verifyAsync: jest.fn(), signAsync: jest.fn() };
  const service = new AuthService(users as unknown as Model<UserDocument>, {} as Model<ModeratorAssignmentDocument>, sessions as unknown as Model<SessionDocument>, jwt as unknown as JwtService, new ConfigService({ JWT_ACCESS_SECRET: 'access-test', JWT_REFRESH_SECRET: 'refresh-test' }));
  const sub = new Types.ObjectId();
  const sid = new Types.ObjectId();
  beforeEach(() => {
    jest.resetAllMocks();
    jwt.verifyAsync.mockResolvedValue({ sub: sub.toString(), sid: sid.toString(), jti: 'old' });
    jwt.signAsync.mockResolvedValue('new-token');
    users.findById.mockResolvedValue({ _id: sub, status: AccountStatus.ACTIVE, role: UserRole.USER });
    sessions.findOneAndUpdate.mockResolvedValue({ _id: sid, refreshJti: 'new' });
  });
  it('checks the presented token and session conditions in the same atomic rotation', async () => {
    await expect(service.refresh('old-token')).resolves.toMatchObject({ accessToken: 'new-token', refreshToken: 'new-token' });
    expect(sessions.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ refreshJti: 'old', revokedAt: null, expiresAt: { $gt: expect.any(Date) }, lastActivityAt: { $gt: expect.any(Date) } }), expect.objectContaining({ $set: expect.objectContaining({ refreshJti: expect.any(String) }) }), { returnDocument: 'after' });
  });
  it('preserves session revocation when a token is reused', async () => {
    sessions.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.refresh('reused')).rejects.toMatchObject({ status: 401 });
    expect(sessions.updateOne).toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('revokes refresh access for inactive accounts', async () => {
    users.findById.mockResolvedValue({ status: AccountStatus.SUSPENDED });
    await expect(service.refresh('token')).rejects.toMatchObject({ status: 401 });
    expect(sessions.updateOne).toHaveBeenCalled();
    expect(sessions.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects a missing refresh cookie', async () => {
    await expect(service.refresh(undefined)).rejects.toMatchObject({ status: 401 });
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});
