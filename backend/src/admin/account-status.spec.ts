import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminService } from './admin.service';
import { AccountStatus, UserRole } from '../users/schemas/user.schema';

describe('AdminService account status (ACC-16, ACC-15)', () => {
  const userModel = { findById: jest.fn(), updateOne: jest.fn() };
  const sessionModel = { updateMany: jest.fn() };
  const service = new AdminService(userModel as any, {} as any, {} as any, {} as any, sessionModel as any);

  const id = new Types.ObjectId();
  const account = (overrides: object = {}) => ({
    _id: id,
    email: 'nour@example.com',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    userModel.findById.mockResolvedValue(account());
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  describe('suspendAccount', () => {
    it('suspends an active user and logs them out everywhere', async () => {
      await expect(service.suspendAccount(id.toString())).resolves.toEqual({
        id,
        email: 'nour@example.com',
        role: UserRole.USER,
        status: AccountStatus.SUSPENDED,
      });
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: id, status: AccountStatus.ACTIVE },
        { $set: { status: AccountStatus.SUSPENDED } },
      );
      expect(sessionModel.updateMany).toHaveBeenCalledWith(
        { user: id, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } },
      );
    });

    it('suspends a moderator', async () => {
      userModel.findById.mockResolvedValue(account({ role: UserRole.MODERATOR }));
      await expect(service.suspendAccount(id.toString())).resolves.toMatchObject({ status: AccountStatus.SUSPENDED });
    });

    it('only changes the status, never bookings or content', async () => {
      await service.suspendAccount(id.toString());
      expect(userModel.updateOne).toHaveBeenCalledTimes(1);
      expect(Object.keys(userModel.updateOne.mock.calls[0][1].$set)).toEqual(['status']);
    });

    it('refuses an admin account', async () => {
      userModel.findById.mockResolvedValue(account({ role: UserRole.ADMIN }));
      await expect(service.suspendAccount(id.toString())).rejects.toThrow(
        new ForbiddenException('An admin account cannot be suspended'),
      );
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('rejects an account that is already suspended', async () => {
      userModel.findById.mockResolvedValue(account({ status: AccountStatus.SUSPENDED }));
      await expect(service.suspendAccount(id.toString())).rejects.toThrow(
        new ConflictException('Account is already suspended'),
      );
    });

    it('rejects a deactivated account', async () => {
      userModel.findById.mockResolvedValue(account({ status: AccountStatus.DEACTIVATED }));
      await expect(service.suspendAccount(id.toString())).rejects.toThrow(
        new ConflictException('A deactivated account cannot be suspended'),
      );
    });

    it('does not log out sessions if the status changed at the same moment', async () => {
      userModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
      await expect(service.suspendAccount(id.toString())).rejects.toBeInstanceOf(ConflictException);
      expect(sessionModel.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an invalid id and an unknown account', async () => {
      await expect(service.suspendAccount('abc')).rejects.toThrow(new BadRequestException('Invalid user ID'));
      userModel.findById.mockResolvedValue(null);
      await expect(service.suspendAccount(id.toString())).rejects.toThrow(new NotFoundException('User not found'));
    });
  });

  describe('reactivateAccount', () => {
    it('reactivates a suspended account', async () => {
      userModel.findById.mockResolvedValue(account({ status: AccountStatus.SUSPENDED }));
      await expect(service.reactivateAccount(id.toString())).resolves.toMatchObject({ status: AccountStatus.ACTIVE });
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: id, status: AccountStatus.SUSPENDED },
        { $set: { status: AccountStatus.ACTIVE } },
      );
    });

    it.each([AccountStatus.ACTIVE, AccountStatus.DEACTIVATED])('rejects a %s account', async (status) => {
      userModel.findById.mockResolvedValue(account({ status }));
      await expect(service.reactivateAccount(id.toString())).rejects.toThrow(
        new ConflictException('Only a suspended account can be reactivated'),
      );
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('refuses an admin account', async () => {
      userModel.findById.mockResolvedValue(account({ role: UserRole.ADMIN, status: AccountStatus.SUSPENDED }));
      await expect(service.reactivateAccount(id.toString())).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});