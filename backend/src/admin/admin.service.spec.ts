import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { AccountStatus, UserRole } from '../users/schemas/user.schema';
import { ProviderType } from '../users/schemas/moderatorassignment.schema';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('AdminService.createModerator (ACC-13)', () => {
  const userModel = { exists: jest.fn(), create: jest.fn(), deleteOne: jest.fn() };
  const assignmentModel = { create: jest.fn() };
  const hotelModel = { exists: jest.fn() };
  const airlineModel = { exists: jest.fn() };
  const service = new AdminService(userModel as any, assignmentModel as any, hotelModel as any, airlineModel as any);

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
});