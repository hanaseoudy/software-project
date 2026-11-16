import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
    updatePolicies: jest.fn(),
    setCancellationTiers: jest.fn(),
    createRoom: jest.fn(),
    addRoomBookableRange: jest.fn(),
    updateRoom: jest.fn(),
    updateRoomBookableRange: jest.fn(),
    removeRoomBookableRange: jest.fn(),
    blockRoomDates: jest.fn(),
    deactivateRoom: jest.fn(),
    deleteRoom: jest.fn(),
    getRoomStatuses: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelsController],
      providers: [{ provide: HotelsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
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
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    service.update.mockResolvedValue({ id: 'h1' });

    await controller.update('h1', { name: 'New name' }, { user } as never);

    expect(service.update).toHaveBeenCalledWith(
      'h1',
      { name: 'New name' },
      user,
    );
  });

  it('updateRoomBookableRange passes the ids, body and the authenticated user', async () => {
    const user = { sub: 'm1', role: 'moderator' };
    const body = { rangeId: 'r1', endDate: '2026-12-20' };
    service.updateRoomBookableRange.mockResolvedValue({ id: 'r1' });

    await controller.updateRoomBookableRange('h1', 'room1', body, {
      user,
    } as never);

    expect(service.updateRoomBookableRange).toHaveBeenCalledWith(
      'h1',
      'room1',
      body,
      user,
    );
  });

  it('updatePolicies passes the id, body and the authenticated user', async () => {
    const user = { sub: 'm1', role: 'moderator' };
    const body = { checkInTime: '15:00' };
    service.updatePolicies.mockResolvedValue({ id: 'h1' });

    await controller.updatePolicies('h1', body, { user } as never);

    expect(service.updatePolicies).toHaveBeenCalledWith('h1', body, user);
  });

  it('updateCheckTimes passes the id, body and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    const body = { checkInTime: '15:00', checkOutTime: '11:00' };
    service.updateCheckTimes.mockResolvedValue({ id: 'h1' });

    await controller.updateCheckTimes('h1', body, { user } as never);

    expect(service.updateCheckTimes).toHaveBeenCalledWith('h1', body, user);
  });

  it('setCancellationTiers passes the id, body and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    const body = { tiers: [{ daysBeforeCheckIn: 7, refundPercentage: 50 }] };
    service.setCancellationTiers.mockResolvedValue({ id: 'h1' });

    await controller.setCancellationTiers('h1', body, { user } as never);

    expect(service.setCancellationTiers).toHaveBeenCalledWith('h1', body, user);
  });

  it('createRoom passes the hotel id, body and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
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
    const user = { sub: 'u1', role: UserRole.MODERATOR };
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
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    const body = { pricePerNight: 1750 };
    service.updateRoom.mockResolvedValue({ id: 'r1' });

    await controller.updateRoom('h1', 'r1', body, { user } as never);

    expect(service.updateRoom).toHaveBeenCalledWith('h1', 'r1', body, user);
  });

  it('removeRoomBookableRange passes the ids and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
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

  it('blockRoomDates passes the ids, body and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    const body = {
      startDate: '2026-12-10',
      endDate: '2026-12-15',
      reason: 'Maintenance',
    };
    service.blockRoomDates.mockResolvedValue({ id: 'b1' });

    await expect(
      controller.blockRoomDates('h1', 'r1', body, { user } as never),
    ).resolves.toEqual({ id: 'b1' });

    expect(service.blockRoomDates).toHaveBeenCalledWith('h1', 'r1', body, user);
  });

  it('deactivateRoom passes the ids and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    service.deactivateRoom.mockResolvedValue({ id: 'r1', isActive: false });

    await expect(
      controller.deactivateRoom('h1', 'r1', { user } as never),
    ).resolves.toEqual({ id: 'r1', isActive: false });

    expect(service.deactivateRoom).toHaveBeenCalledWith('h1', 'r1', user);
  });

  it('deleteRoom passes the ids and the authenticated user', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    service.deleteRoom.mockResolvedValue(undefined);

    await controller.deleteRoom('h1', 'r1', { user } as never);

    expect(service.deleteRoom).toHaveBeenCalledWith('h1', 'r1', user);
  });

  it('getRoomStatuses passes the hotel id, the dates and the authenticated user (HTL-08)', async () => {
    const user = { sub: 'u1', role: UserRole.MODERATOR };
    const query = { startDate: '2026-12-01', endDate: '2026-12-31', page: 1 };
    const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    service.getRoomStatuses.mockResolvedValue(page);

    await expect(
      controller.getRoomStatuses('h1', query, { user } as never),
    ).resolves.toEqual(page);
    expect(service.getRoomStatuses).toHaveBeenCalledWith('h1', query, user);
  });
});
