import { Types } from 'mongoose';
import { AdminProviderListsService } from './admin-provider-lists.service';

describe('AdminProviderListsService (BE-5: ACC-13 / ACC-15)', () => {
  const makeQuery = () => ({
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn(),
  });
  const airlineQuery = makeQuery();
  const hotelQuery = makeQuery();
  const airlineCount = { exec: jest.fn() };
  const hotelCount = { exec: jest.fn() };
  const airlineModel = { find: jest.fn(), countDocuments: jest.fn() };
  const hotelModel = { find: jest.fn(), countDocuments: jest.fn() };
  const service = new AdminProviderListsService(hotelModel as any, airlineModel as any);

  const airlineId = new Types.ObjectId();
  const hotelId = new Types.ObjectId();

  beforeEach(() => {
    jest.resetAllMocks();
    for (const query of [airlineQuery, hotelQuery]) {
      for (const step of ['sort', 'skip', 'limit', 'select', 'lean'] as const) {
        query[step].mockReturnValue(query);
      }
    }
    airlineModel.find.mockReturnValue(airlineQuery);
    airlineModel.countDocuments.mockReturnValue(airlineCount);
    hotelModel.find.mockReturnValue(hotelQuery);
    hotelModel.countDocuments.mockReturnValue(hotelCount);
  });

  it('lists airlines sorted by name, 10 per page, including deactivated ones', async () => {
    airlineQuery.exec.mockResolvedValue([
      { _id: airlineId, name: 'EgyptAir', code: 'MS', isActive: false },
    ]);
    airlineCount.exec.mockResolvedValue(1);

    const result = await service.listAirlines();

    expect(airlineModel.find).toHaveBeenCalledWith();
    expect(airlineQuery.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(airlineQuery.skip).toHaveBeenCalledWith(0);
    expect(airlineQuery.limit).toHaveBeenCalledWith(10);
    expect(airlineQuery.select).toHaveBeenCalledWith('name code isActive');
    expect(result).toEqual({
      items: [{ id: airlineId.toString(), name: 'EgyptAir', code: 'MS', isActive: false }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it('skips earlier pages and treats a missing isActive as active', async () => {
    airlineQuery.exec.mockResolvedValue([{ _id: airlineId, name: 'Zeta Air', code: 'ZT' }]);
    airlineCount.exec.mockResolvedValue(11);

    const result = await service.listAirlines(2);

    expect(airlineQuery.skip).toHaveBeenCalledWith(10);
    expect(result.items[0].isActive).toBe(true);
    expect(result).toMatchObject({ total: 11, page: 2, pageSize: 10, totalPages: 2 });
  });

  it('lists hotels sorted by name, 10 per page, including deactivated ones', async () => {
    hotelQuery.exec.mockResolvedValue([
      { _id: hotelId, name: 'HTL Test Hotel', isActive: true },
    ]);
    hotelCount.exec.mockResolvedValue(1);

    const result = await service.listHotels();

    expect(hotelModel.find).toHaveBeenCalledWith();
    expect(hotelQuery.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(hotelQuery.skip).toHaveBeenCalledWith(0);
    expect(hotelQuery.limit).toHaveBeenCalledWith(10);
    expect(hotelQuery.select).toHaveBeenCalledWith('name isActive');
    expect(result).toEqual({
      items: [{ id: hotelId.toString(), name: 'HTL Test Hotel', isActive: true }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it('returns an empty page when there are no hotels', async () => {
    hotelQuery.exec.mockResolvedValue([]);
    hotelCount.exec.mockResolvedValue(0);

    const result = await service.listHotels();

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });
});