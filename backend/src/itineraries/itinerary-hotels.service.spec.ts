import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ItineraryHotelsService } from './itinerary-hotels.service';
import { ItineraryHotelSearchQueryDto } from './dto/itinerary-hotel-search-query.dto';
import { HotelSortBy, SortOrder } from '../hotels/dto/search-hotels-query.dto';

describe('ITN-25 group resolution and delegation', () => {
  const owner = new Types.ObjectId().toString(),
    parentId = new Types.ObjectId(),
    cityId = new Types.ObjectId();
  const day = (number: number, city = 'CAI') => ({
    _id: new Types.ObjectId(),
    dayNumber: number,
    cityId: city,
  });
  const chain = (value: unknown) => ({
    session: jest.fn().mockReturnThis(),
    read: jest.fn().mockReturnThis(),
    maxTimeMS: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  });
  let rows: ReturnType<typeof day>[], start: Date;
  let parent: { findOne: jest.Mock },
    days: { find: jest.Mock },
    cities: { findOne: jest.Mock };
  let session: { endSession: jest.Mock },
    connection: { startSession: jest.Mock },
    hotels: { search: jest.Mock },
    service: ItineraryHotelsService;
  const result = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  const query = (
    over: Partial<ItineraryHotelSearchQueryDto> = {},
  ): ItineraryHotelSearchQueryDto => ({
    groupFirstDayId: rows[0]._id.toString(),
    guests: 3,
    rooms: 2,
    page: 1,
    ...over,
  });
  beforeEach(() => {
    rows = [day(1), day(2), day(3, 'GIZ'), day(4)];
    start = new Date('2028-02-28T00:00:00Z');
    parent = {
      findOne: jest.fn(() => chain({ _id: parentId, startDate: start })),
    };
    days = { find: jest.fn(() => chain(rows)) };
    cities = {
      findOne: jest.fn(() =>
        chain({ _id: cityId, cityId: 'CAI', name: 'Cairo', countryCode: 'EG' }),
      ),
    };
    session = { endSession: jest.fn().mockResolvedValue(undefined) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    hotels = { search: jest.fn().mockResolvedValue(result) };
    service = new ItineraryHotelsService(
      parent as never,
      days as never,
      cities as never,
      connection as never,
      hotels as never,
    );
  });
  it('maps GEN-12 code to ObjectId, derives leap dates, delegates once and preserves the response', async () => {
    expect(await service.search(owner, parentId.toString(), query())).toBe(
      result,
    );
    expect(parent.findOne).toHaveBeenCalledWith({
      _id: parentId,
      userId: new Types.ObjectId(owner),
    });
    expect(cities.findOne).toHaveBeenCalledWith({ cityId: 'CAI' });
    expect(hotels.search).toHaveBeenCalledTimes(1);
    expect(hotels.search).toHaveBeenCalledWith(
      expect.objectContaining({
        city: cityId.toString(),
        checkIn: '2028-02-28',
        checkOut: '2028-03-01',
        guests: 3,
        rooms: 2,
        page: 1,
      }),
    );
    expect(hotels.search.mock.calls[0][0]).not.toHaveProperty(
      'groupFirstDayId',
    );
  });
  it('keeps repeated city visits separate and handles a one-day group', async () => {
    await service.search(
      owner,
      parentId.toString(),
      query({ groupFirstDayId: rows[3]._id.toString() }),
    );
    expect(hotels.search).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIn: '2028-03-02',
        checkOut: '2028-03-03',
      }),
    );
  });
  it('passes pagination, occupancy and all supported HTL-12 filters unchanged', async () => {
    await service.search(
      owner,
      parentId.toString(),
      query({
        page: 2,
        minPrice: 10,
        maxPrice: 100,
        minRating: 4,
        sortBy: HotelSortBy.PRICE,
        sortOrder: SortOrder.DESC,
      }),
    );
    expect(hotels.search).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        minPrice: 10,
        maxPrice: 100,
        minRating: 4,
        sortBy: 'price',
        sortOrder: 'desc',
      }),
    );
  });
  it('defaults rooms/page using HTL-11 conventions', async () => {
    await service.search(
      owner,
      parentId.toString(),
      query({ rooms: undefined, page: undefined }),
    );
    expect(hotels.search).toHaveBeenCalledWith(
      expect.objectContaining({ rooms: 1, page: 1 }),
    );
  });
  it('pins the read-only primary snapshot and closes it before availability search', async () => {
    await service.search(owner, parentId.toString(), query());
    expect(connection.startSession).toHaveBeenCalledWith({
      snapshot: true,
      causalConsistency: false,
    });
    for (const model of [parent.findOne, days.find, cities.findOne]) {
      const q = model.mock.results[0].value;
      expect(q.session).toHaveBeenCalledWith(session);
      expect(q.read).toHaveBeenCalledWith('primary');
      expect(q.maxTimeMS).toHaveBeenCalledWith(5000);
    }
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(session.endSession.mock.invocationCallOrder[0]).toBeLessThan(
      hotels.search.mock.invocationCallOrder[0],
    );
  });
  it.each(['parent', 'group'])(
    'rejects an invalid %s ID before database access',
    async (kind) => {
      await expect(
        service.search(
          owner,
          kind === 'parent' ? 'bad' : parentId.toString(),
          query(kind === 'group' ? { groupFirstDayId: 'bad' } : {}),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(connection.startSession).not.toHaveBeenCalled();
      expect(hotels.search).not.toHaveBeenCalled();
    },
  );
  it('returns a nondisclosing 404 for an unavailable owned itinerary', async () => {
    parent.findOne.mockReturnValue(chain(null));
    await expect(
      service.search(owner, parentId.toString(), query()),
    ).rejects.toMatchObject({ status: 404 });
    expect(days.find).not.toHaveBeenCalled();
    expect(hotels.search).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
  it.each(['empty', 'nonexistent', 'interior'])(
    'rejects %s group selection',
    async (kind) => {
      const selected =
        kind === 'interior'
          ? rows[1]._id.toString()
          : new Types.ObjectId().toString();
      if (kind === 'empty') days.find.mockReturnValue(chain([]));
      await expect(
        service.search(
          owner,
          parentId.toString(),
          query({ groupFirstDayId: selected }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(hotels.search).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalled();
    },
  );
  it('recalculates an edited group on every request instead of caching boundaries', async () => {
    const selected = query();
    await service.search(owner, parentId.toString(), selected);
    rows[2].cityId = 'CAI';
    await service.search(owner, parentId.toString(), selected);
    expect(hotels.search.mock.calls[1][0]).toMatchObject({
      checkIn: '2028-02-28',
      checkOut: '2028-03-03',
    });
  });
  it.each([
    ['2028-12-31', '2029-01-01'],
    ['2028-04-30', '2028-05-01'],
    ['2028-02-29', '2028-03-01'],
  ])('handles %s calendar boundary', async (input, checkout) => {
    start = new Date(input + 'T00:00:00Z');
    rows = [day(1)];
    await service.search(owner, parentId.toString(), query());
    expect(hotels.search).toHaveBeenCalledWith(
      expect.objectContaining({ checkIn: input, checkOut: checkout }),
    );
  });
  it.each(['gap', 'duplicate', 'city', 'too-many'])(
    'fails closed on invalid %s day data',
    async (kind) => {
      if (kind === 'gap') rows[1].dayNumber = 3;
      if (kind === 'duplicate') rows[1].dayNumber = 1;
      if (kind === 'city') rows[0].cityId = ' ';
      if (kind === 'too-many')
        rows = Array.from({ length: 61 }, (_, i) => day(i + 1));
      await expect(
        service.search(owner, parentId.toString(), query()),
      ).rejects.toMatchObject({ status: 409 });
      expect(hotels.search).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    { _id: cityId, name: '', countryCode: 'EG' },
    { _id: cityId, name: 'Cairo', countryCode: 'bad' },
  ])('rejects malformed city mapping %j', async (city) => {
    cities.findOne.mockReturnValue(chain(city));
    await expect(
      service.search(owner, parentId.toString(), query()),
    ).rejects.toMatchObject({ status: 409 });
    expect(hotels.search).not.toHaveBeenCalled();
  });
  it.each([new Date(NaN), new Date('9999-12-31T00:00:00Z')])(
    'rejects invalid or overflowing dates %s',
    async (value) => {
      start = value;
      await expect(
        service.search(owner, parentId.toString(), query()),
      ).rejects.toMatchObject({ status: 409 });
      expect(hotels.search).not.toHaveBeenCalled();
    },
  );
  it.each([50, 239, 246])(
    'fails closed on snapshot error %s and releases the session',
    async (code) => {
      const q = chain(null);
      q.lean.mockRejectedValue(
        Object.assign(new Error('Unavailable'), { code }),
      );
      parent.findOne.mockReturnValue(q);
      await expect(
        service.search(owner, parentId.toString(), query()),
      ).rejects.toMatchObject({ status: 503 });
      expect(session.endSession).toHaveBeenCalled();
      expect(hotels.search).not.toHaveBeenCalled();
    },
  );
  it('preserves HTL-11 errors and closes the snapshot even when hotel search fails', async () => {
    const error = new BadRequestException('Check-in cannot be in the past');
    hotels.search.mockRejectedValue(error);
    await expect(
      service.search(owner, parentId.toString(), query()),
    ).rejects.toBe(error);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
