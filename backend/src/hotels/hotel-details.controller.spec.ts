import { Test } from '@nestjs/testing';
import { HotelDetailsController } from './hotel-details.controller';
import { HotelsService } from './hotels.service';

describe('HotelDetailsController', () => {
  let controller: HotelDetailsController;
  const service = { getDetails: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelDetailsController],
      providers: [{ provide: HotelsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(HotelDetailsController);
  });

  it('getDetails passes the id and the stay dates', async () => {
    const query = { checkIn: '2026-12-10', checkOut: '2026-12-13' };
    service.getDetails.mockResolvedValue({ id: 'h1' });

    await controller.getDetails('h1', query);

    expect(service.getDetails).toHaveBeenCalledWith('h1', query);
  });

  it('is public: it has no login or role guard', () => {
    expect(
      Reflect.getMetadata('__guards__', HotelDetailsController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        '__guards__',
        HotelDetailsController.prototype.getDetails,
      ),
    ).toBeUndefined();
  });
});
