import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { AuthService } from './auth.service';
import { SessionDocument } from './schemas/session.schema';
import { AccountStatus, UserDocument, UserRole } from '../users/schemas/user.schema';
import { ModeratorAssignmentDocument, ProviderType } from '../users/schemas/moderatorassignment.schema';

// BE-2: GET /api/auth/me and POST /api/auth/login also return providerId (null for users and admins).
describe('AuthService providerId (BE-2)', () => {
  const users = { findById: jest.fn() };
  const assignments = { findOne: jest.fn() };
  const service = new AuthService(
    users as unknown as Model<UserDocument>,
    assignments as unknown as Model<ModeratorAssignmentDocument>,
    {} as Model<SessionDocument>,
    {} as JwtService,
    new ConfigService({}),
  );
  const userId = new Types.ObjectId();
  const account = (role: UserRole) => ({
    _id: userId,
    firstName: 'Nour',
    lastName: 'Hossam',
    email: 'nour@example.com',
    role,
    status: AccountStatus.ACTIVE,
    mustChangePassword: false,
    emailVerified: true,
  });

  beforeEach(() => jest.resetAllMocks());

  it.each([ProviderType.AIRLINE, ProviderType.HOTEL])('returns the assigned %s id for a moderator', async (type) => {
    const providerId = new Types.ObjectId();
    users.findById.mockResolvedValue(account(UserRole.MODERATOR));
    assignments.findOne.mockResolvedValue({ moderatorId: userId, providerType: type, providerId });

    const me = await service.me(userId.toString());

    expect(assignments.findOne).toHaveBeenCalledWith({ moderatorId: userId });
    expect(me.providerType).toBe(type);
    expect(me.providerId).toBe(providerId.toString());
  });

  it.each([UserRole.USER, UserRole.ADMIN])('returns providerId null for a %s', async (role) => {
    users.findById.mockResolvedValue(account(role));

    const me = await service.me(userId.toString());

    expect(me.providerType).toBeNull();
    expect(me.providerId).toBeNull();
    expect(assignments.findOne).not.toHaveBeenCalled();
  });

  it('returns null when a moderator has no assignment', async () => {
    users.findById.mockResolvedValue(account(UserRole.MODERATOR));
    assignments.findOne.mockResolvedValue(null);

    const me = await service.me(userId.toString());

    expect(me.providerType).toBeNull();
    expect(me.providerId).toBeNull();
  });

  it('keeps every existing field unchanged and only adds providerId', async () => {
    users.findById.mockResolvedValue(account(UserRole.USER));

    expect(await service.me(userId.toString())).toEqual({
      id: userId,
      firstName: 'Nour',
      lastName: 'Hossam',
      email: 'nour@example.com',
      role: UserRole.USER,
      providerType: null,
      providerId: null,
      mustChangePassword: false,
      emailVerified: true,
    });
  });
});
