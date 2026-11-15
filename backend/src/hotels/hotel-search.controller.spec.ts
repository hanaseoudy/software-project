import { Test } from '@nestjs/testing';
import { HotelSearchController } from './hotel-search.controller';
import { HotelSearchService } from './hotel-search.service';

describe('HotelSearchController', () => {
  let controller: HotelSearchController;
  const service = { search: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelSearchController],
      providers: [{ provide: HotelSearchService, useValue: service }],
    }).compile();
    controller = moduleRef.get(HotelSearchController);
  });

  it('search passes the query to the service', async () => {
    const query = {
      city: 'c1',
      checkIn: '2026-12-10',
      checkOut: '2026-12-14',
      guests: 2,
      rooms: 1,
      page: 1,
    };
    const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    service.search.mockResolvedValue(page);

    await expect(controller.search(query)).resolves.toEqual(page);
    expect(service.search).toHaveBeenCalledWith(query);
  });
});
