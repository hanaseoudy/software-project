import { Test } from '@nestjs/testing';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';

describe('HotelsController', () => {
  let controller: HotelsController;
  const service = {
    create: jest.fn(),
    update: jest.fn(),
    updateCheckTimes: jest.fn(),
    setCancellationTiers: jest.fn(),
    createRoom: jest.fn(),
    addRoomBookableRange: jest.fn(),
    getDetails: jest.fn(),
    updateRoom: jest.fn(),
    removeRoomBookableRange: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelsController],
      providers: [{ provide: HotelsService, useValue: service }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(HotelsController);
  });

  it('create delegates to the service', async () => {
    const dto = {
      name: 'Nile Palace',
      address: '1 Corniche',
      city: 'c',
      country: 'k',
      starRating: 5,
    };
    service.create.mockResolvedValue({ id: 'h1' });

    await expect(controller.create(dto)).resolves.toEqual({ id: 'h1' });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update passes the id, body and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    service.update.mockResolvedValue({ id: 'h1' });

    await controller.update('h1', { name: 'New name' }, { user } as never);

    expect(service.update).toHaveBeenCalledWith(
      'h1',
      { name: 'New name' },
      user,
    );
  });

  it('updateCheckTimes passes the id, body and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    const body = { checkInTime: '15:00', checkOutTime: '11:00' };
    service.updateCheckTimes.mockResolvedValue({ id: 'h1' });

    await controller.updateCheckTimes('h1', body, { user } as never);

    expect(service.updateCheckTimes).toHaveBeenCalledWith('h1', body, user);
  });

  it('setCancellationTiers passes the id, body and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    const body = { tiers: [{ daysBeforeCheckIn: 7, refundPercentage: 50 }] };
    service.setCancellationTiers.mockResolvedValue({ id: 'h1' });

    await controller.setCancellationTiers('h1', body, { user } as never);

    expect(service.setCancellationTiers).toHaveBeenCalledWith('h1', body, user);
  });

  it('createRoom passes the hotel id, body and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    const body = {
      roomNumber: 'A101',
      type: 'Double',
      beds: 2,
      maxOccupancy: 3,
      pricePerNight: 1500,
    };
    service.createRoom.mockResolvedValue({ id: 'r1' });

    await controller.createRoom('h1', body, { user } as never);

    expect(service.createRoom).toHaveBeenCalledWith('h1', body, user);
  });

  it('addRoomBookableRange passes the ids, body and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    const body = { startDate: '2026-12-01', endDate: '2026-12-31' };
    service.addRoomBookableRange.mockResolvedValue({ id: 'a1' });

    await controller.addRoomBookableRange('h1', 'r1', body, { user } as never);

    expect(service.addRoomBookableRange).toHaveBeenCalledWith(
      'h1',
      'r1',
      body,
      user,
    );
  });

  it('updateRoom passes the ids, body and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    const body = { pricePerNight: 1750 };
    service.updateRoom.mockResolvedValue({ id: 'r1' });

    await controller.updateRoom('h1', 'r1', body, { user } as never);

    expect(service.updateRoom).toHaveBeenCalledWith('h1', 'r1', body, user);
  });

  it('removeRoomBookableRange passes the ids and the authenticated user', async () => {
    const user = { id: 'u1', role: UserRole.MODERATOR };
    service.removeRoomBookableRange.mockResolvedValue({ id: 'a1' });

    await controller.removeRoomBookableRange('h1', 'r1', 'a1', {
      user,
    } as never);

    expect(service.removeRoomBookableRange).toHaveBeenCalledWith(
      'h1',
      'r1',
      'a1',
      user,
    );
  });

  it('getDetails passes the id and the stay dates', async () => {
    const query = { checkIn: '2026-12-10', checkOut: '2026-12-13' };
    service.getDetails.mockResolvedValue({ id: 'h1' });

    await controller.getDetails('h1', query);

    expect(service.getDetails).toHaveBeenCalledWith('h1', query);
  });
});
