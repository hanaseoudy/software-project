import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminProvidersService } from './admin-providers.service';
import { ProviderType } from '../users/schemas/moderatorassignment.schema';
import { NotificationType } from '../notifications/enums/notification.enums';

describe('AdminProvidersService (ACC-15)', () => {
  const query = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });
  const hotelModel = { findById: jest.fn(), updateOne: jest.fn() };
  const airlineModel = { findById: jest.fn(), updateOne: jest.fn() };
  const assignmentModel = { find: jest.fn() };
  const notificationsService = { createForMany: jest.fn() };
  const service = new AdminProvidersService(
    hotelModel as any,
    airlineModel as any,
    assignmentModel as any,
    notificationsService as any,
  );

  const id = new Types.ObjectId();
  const moderatorId = new Types.ObjectId();

  beforeEach(() => {
    jest.resetAllMocks();
    hotelModel.findById.mockReturnValue(query({ _id: id, name: 'Nile Palace', isActive: true }));
    hotelModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    airlineModel.findById.mockReturnValue(query({ _id: id, name: 'Nile Air', isActive: false }));
    airlineModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    assignmentModel.find.mockReturnValue(query([{ moderatorId }]));
  });

  it('deactivates an active hotel and notifies its moderators', async () => {
    await expect(service.deactivateProvider(ProviderType.HOTEL, id.toString())).resolves.toEqual({
      id,
      type: ProviderType.HOTEL,
      name: 'Nile Palace',
      isActive: false,
    });
    expect(hotelModel.updateOne).toHaveBeenCalledWith(
      { _id: id, isActive: { $ne: false } },
      { $set: { isActive: false } },
    );
    expect(assignmentModel.find).toHaveBeenCalledWith({ providerId: id, providerType: ProviderType.HOTEL });
    expect(notificationsService.createForMany).toHaveBeenCalledWith(
      [moderatorId],
      expect.objectContaining({ type: NotificationType.PROVIDER_SUSPENDED }),
    );
  });

  it('reactivates an inactive airline and notifies its moderators', async () => {
    await expect(service.reactivateProvider(ProviderType.AIRLINE, id.toString())).resolves.toMatchObject({
      type: ProviderType.AIRLINE,
      isActive: true,
    });
    expect(airlineModel.updateOne).toHaveBeenCalledWith({ _id: id, isActive: false }, { $set: { isActive: true } });
    expect(notificationsService.createForMany).toHaveBeenCalledWith(
      [moderatorId],
      expect.objectContaining({ type: NotificationType.PROVIDER_REACTIVATED }),
    );
  });

  it('treats a provider without the isActive field as active', async () => {
    hotelModel.findById.mockReturnValue(query({ _id: id, name: 'Nile Palace' }));
    await expect(service.deactivateProvider(ProviderType.HOTEL, id.toString())).resolves.toMatchObject({ isActive: false });
  });

  it('rejects a provider that is already in that state', async () => {
    await expect(service.reactivateProvider(ProviderType.HOTEL, id.toString())).rejects.toThrow(
      new ConflictException('Hotel is already active'),
    );
    await expect(service.deactivateProvider(ProviderType.AIRLINE, id.toString())).rejects.toThrow(
      new ConflictException('Airline is already deactivated'),
    );
    expect(hotelModel.updateOne).not.toHaveBeenCalled();
    expect(airlineModel.updateOne).not.toHaveBeenCalled();
  });

  it('does not notify if the status changed at the same moment', async () => {
    hotelModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(service.deactivateProvider(ProviderType.HOTEL, id.toString())).rejects.toBeInstanceOf(ConflictException);
    expect(notificationsService.createForMany).not.toHaveBeenCalled();
  });

  it('still deactivates the provider if the notification fails', async () => {
    notificationsService.createForMany.mockRejectedValue(new Error('db down'));
    await expect(service.deactivateProvider(ProviderType.HOTEL, id.toString())).resolves.toMatchObject({ isActive: false });
  });

  it('rejects an invalid id and an unknown provider', async () => {
    await expect(service.deactivateProvider(ProviderType.HOTEL, 'abc')).rejects.toThrow(
      new BadRequestException('Invalid provider ID'),
    );
    airlineModel.findById.mockReturnValue(query(null));
    await expect(service.deactivateProvider(ProviderType.AIRLINE, id.toString())).rejects.toThrow(
      new NotFoundException('Airline not found'),
    );
  });
});