import { Test } from '@nestjs/testing';
import { HotelRoomAvailabilityController } from './hotel-room-availability.controller';
import { HotelRoomAvailabilityService } from './hotel-room-availability.service';

describe('HotelRoomAvailabilityController', () => {
  let controller: HotelRoomAvailabilityController;
  const service = { findAvailable: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelRoomAvailabilityController],
      providers: [{ provide: HotelRoomAvailabilityService, useValue: service }],
    }).compile();
    controller = moduleRef.get(HotelRoomAvailabilityController);
  });

  it('findAvailable passes the hotel id and the query to the service', async () => {
    const query = { checkIn: '2026-12-10', checkOut: '2026-12-14', page: 1 };
    const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    service.findAvailable.mockResolvedValue(page);

    await expect(controller.findAvailable('h1', query)).resolves.toEqual(page);
    expect(service.findAvailable).toHaveBeenCalledWith('h1', query);
  });
});
