import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { AccountStatus, UserRole } from '../users/schemas/user.schema';
import { ProviderType } from '../users/schemas/moderatorassignment.schema';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('AdminService (ACC-13, ACC-07a)', () => {
  const userModel = {
    exists: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
  };
  const assignmentModel = { create: jest.fn() };
  const hotelModel = { exists: jest.fn(), findById: jest.fn() };
  const airlineModel = { exists: jest.fn(), findById: jest.fn() };
  const sessionModel = { updateMany: jest.fn() };
  const mail = { sendModeratorInvitation: jest.fn() };
  const service = new AdminService(
    userModel as any,
    assignmentModel as any,
    hotelModel as any,
    airlineModel as any,
    sessionModel as any,
{} as any,
    mail as any,
  );
  const providerName = (name: string | null) => ({
    select: () => ({ lean: () => Promise.resolve(name ? { name } : null) }),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const userId = new Types.ObjectId();
  const hotelId = new Types.ObjectId().toString();
  const airlineId = new Types.ObjectId().toString();

  const dto = (overrides: Partial<CreateModeratorDto> = {}): CreateModeratorDto => ({
    firstName: 'Sara',
    lastName: 'Ali',
    email: 'sara@nilepalace.com',
    temporaryPassword: 'Temp1234',
    providerType: ProviderType.HOTEL,
    providerId: hotelId,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-temp');
    hotelModel.exists.mockResolvedValue({ _id: hotelId });
    airlineModel.exists.mockResolvedValue({ _id: airlineId });
    userModel.exists.mockResolvedValue(null);
    userModel.create.mockImplementation(async (data: any) => ({ _id: userId, ...data }));
    assignmentModel.create.mockResolvedValue({});
    hotelModel.findById.mockReturnValue(providerName('Nile Palace'));
    airlineModel.findById.mockReturnValue(providerName('EgyptAir'));
    mail.sendModeratorInvitation.mockResolvedValue(true);
  });

  describe('moderator invitation email (GEN-01-B)', () => {
    it('emails a hotel moderator an invitation with the hotel name, without the temporary password', async () => {
      await service.createModerator(dto());
      await flush();

      expect(mail.sendModeratorInvitation).toHaveBeenCalledWith({
        to: 'sara@nilepalace.com',
        firstName: 'Sara',
        providerType: ProviderType.HOTEL,
        providerName: 'Nile Palace',
      });
      expect(JSON.stringify(mail.sendModeratorInvitation.mock.calls)).not.toContain('Temp1234');
    });

    it('uses the airline name for an airline moderator', async () => {
      await service.createModerator(dto({ providerType: ProviderType.AIRLINE, providerId: airlineId }));
      await flush();

      expect(mail.sendModeratorInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ providerType: ProviderType.AIRLINE, providerName: 'EgyptAir' }),
      );
    });

    it('still creates the account when the invitation email fails', async () => {
      mail.sendModeratorInvitation.mockRejectedValue(new Error('SMTP down'));

      const result = await service.createModerator(dto());
      await flush();

      expect(result.email).toBe('sara@nilepalace.com');
      expect(userModel.deleteOne).not.toHaveBeenCalled();
    });

    it('sends no invitation when the account is not created', async () => {
      userModel.exists.mockResolvedValue({ _id: userId });

      await expect(service.createModerator(dto())).rejects.toBeInstanceOf(ConflictException);
      await flush();

      expect(mail.sendModeratorInvitation).not.toHaveBeenCalled();
    });
  });

  it('creates a hotel moderator with a hashed temporary password and mustChangePassword', async () => {
    const result = await service.createModerator(dto());

    expect(bcrypt.hash).toHaveBeenCalledWith('Temp1234', 10);
    expect(userModel.create).toHaveBeenCalledWith({
      firstName: 'Sara',
      lastName: 'Ali',
      email: 'sara@nilepalace.com',
      passwordHash: 'hashed-temp',
      role: UserRole.MODERATOR,
      status: AccountStatus.ACTIVE,
      mustChangePassword: true,
    });
    expect(result).toEqual({
      id: userId,
      firstName: 'Sara',
      lastName: 'Ali',
      email: 'sara@nilepalace.com',
      role: UserRole.MODERATOR,
      providerType: ProviderType.HOTEL,
      providerId: hotelId,
      mustChangePassword: true,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('links the moderator to exactly one hotel', async () => {
    await service.createModerator(dto());

    expect(hotelModel.exists).toHaveBeenCalledWith({ _id: hotelId });
    expect(airlineModel.exists).not.toHaveBeenCalled();
    expect(assignmentModel.create).toHaveBeenCalledTimes(1);
    expect(assignmentModel.create).toHaveBeenCalledWith({
      moderatorId: userId,
      providerId: hotelId,
      providerType: ProviderType.HOTEL,
    });
  });

  it('links an airline moderator to their airline', async () => {
    const result = await service.createModerator(dto({ providerType: ProviderType.AIRLINE, providerId: airlineId }));

    expect(airlineModel.exists).toHaveBeenCalledWith({ _id: airlineId });
    expect(hotelModel.exists).not.toHaveBeenCalled();
    expect(assignmentModel.create).toHaveBeenCalledWith({
      moderatorId: userId,
      providerId: airlineId,
      providerType: ProviderType.AIRLINE,
    });
    expect(result.providerType).toBe(ProviderType.AIRLINE);
  });

  it('rejects a hotel that does not exist with 404 and creates nothing', async () => {
    hotelModel.exists.mockResolvedValue(null);

    await expect(service.createModerator(dto())).rejects.toThrow(new NotFoundException('Hotel not found'));
    expect(userModel.create).not.toHaveBeenCalled();
    expect(assignmentModel.create).not.toHaveBeenCalled();
  });

  it('rejects an airline that does not exist with 404 and creates nothing', async () => {
    airlineModel.exists.mockResolvedValue(null);

    await expect(
      service.createModerator(dto({ providerType: ProviderType.AIRLINE, providerId: airlineId })),
    ).rejects.toThrow(new NotFoundException('Airline not found'));
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered with 409', async () => {
    userModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    const error = await service.createModerator(dto()).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual({
      message: 'Validation failed',
      errors: { email: ['Email is already registered'] },
    });
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the email is taken at the same moment (duplicate key)', async () => {
    userModel.create.mockRejectedValue({ code: 11000 });

    await expect(service.createModerator(dto())).rejects.toBeInstanceOf(ConflictException);
    expect(assignmentModel.create).not.toHaveBeenCalled();
  });

  it('deletes the new user if the assignment cannot be saved', async () => {
    const failure = new Error('assignment failed');
    assignmentModel.create.mockRejectedValue(failure);

    await expect(service.createModerator(dto())).rejects.toBe(failure);
    expect(userModel.deleteOne).toHaveBeenCalledWith({ _id: userId });
  });

  describe('resetPassword (ACC-07a)', () => {
    const targetId = new Types.ObjectId();
    const target = (role: UserRole) => ({ _id: targetId, email: 'nour@example.com', role });

    beforeEach(() => {
      userModel.findById.mockResolvedValue(target(UserRole.USER));
    });

    it('sets a hashed temporary password and forces a change at the next login', async () => {
      const result = await service.resetPassword(targetId.toString(), { temporaryPassword: 'Reset1234' });

      expect(bcrypt.hash).toHaveBeenCalledWith('Reset1234', 10);
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: targetId },
        {
          $set: {
            passwordHash: 'hashed-temp',
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        },
      );
      expect(result).toEqual({
        id: targetId,
        email: 'nour@example.com',
        role: UserRole.USER,
        mustChangePassword: true,
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('logs the account out of every session', async () => {
      await service.resetPassword(targetId.toString(), { temporaryPassword: 'Reset1234' });

      expect(sessionModel.updateMany).toHaveBeenCalledWith(
        { user: targetId, revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } },
      );
    });

    it("resets a moderator's password", async () => {
      userModel.findById.mockResolvedValue(target(UserRole.MODERATOR));

      const result = await service.resetPassword(targetId.toString(), { temporaryPassword: 'Reset1234' });

      expect(result.role).toBe(UserRole.MODERATOR);
      expect(userModel.updateOne).toHaveBeenCalled();
    });

    it("refuses to reset an admin's password and changes nothing", async () => {
      userModel.findById.mockResolvedValue(target(UserRole.ADMIN));

      await expect(
        service.resetPassword(targetId.toString(), { temporaryPassword: 'Reset1234' }),
      ).rejects.toThrow(new ForbiddenException("An admin's password cannot be reset here"));
      expect(userModel.updateOne).not.toHaveBeenCalled();
      expect(sessionModel.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an account that does not exist with 404', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(
        service.resetPassword(targetId.toString(), { temporaryPassword: 'Reset1234' }),
      ).rejects.toThrow(new NotFoundException('User not found'));
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('rejects an invalid id with 400 without querying', async () => {
      await expect(service.resetPassword('not-an-id', { temporaryPassword: 'Reset1234' })).rejects.toThrow(
        new BadRequestException('Invalid user ID'),
      );
      expect(userModel.findById).not.toHaveBeenCalled();
    });
  });
});