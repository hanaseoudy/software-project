import 'reflect-metadata';
import { Types } from 'mongoose';
import { FavouritesService } from './favourites.service';

// The @nestjs/* packages are ES modules that jest cannot load here, and the
// service only needs them for decorators and exceptions, so they are stubbed.
jest.mock('@nestjs/common', () => {
  class HttpError extends Error {
    constructor(public response?: unknown) {
      super(typeof response === 'string' ? response : 'error');
    }
  }
  return {
    Injectable: () => () => undefined,
    BadRequestException: class BadRequestException extends HttpError {},
    NotFoundException: class NotFoundException extends HttpError {},
  };
});
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));
jest.mock('@nestjs/mongoose', () => ({ InjectModel: () => () => undefined }));
jest.mock('../hotels/schemas/hotel.schema', () => ({
  Hotel: { name: 'Hotel' },
}));
jest.mock('../itineraries/schemas/itinerary.schema', () => ({
  Itinerary: { name: 'Itinerary' },
  ItineraryVisibility: { PRIVATE: 'PRIVATE', PUBLIC: 'PUBLIC' },
}));
jest.mock('./dto/favourites-query.dto', () => ({}));
jest.mock('./schemas/favourite.schema', () => ({
  Favourite: { name: 'Favourite' },
  FavouriteType: { HOTEL: 'hotel', ITINERARY: 'itinerary' },
}));

const userId = new Types.ObjectId();
const hotelId = new Types.ObjectId();
const itineraryId = new Types.ObjectId();

function leanQuery<T>(result: T) {
  const query: Record<string, jest.Mock> = {};
  for (const name of ['sort', 'skip', 'limit', 'select']) {
    query[name] = jest.fn(() => query);
  }
  query.lean = jest.fn().mockResolvedValue(result);
  return query;
}

function setup(
  opts: {
    favourites?: unknown[];
    total?: number;
    hotels?: unknown[];
    itineraries?: unknown[];
    hotelExists?: boolean;
    itineraryExists?: boolean;
    upserted?: number;
    deleted?: number;
  } = {},
) {
  const favouriteModel = {
    updateOne: jest
      .fn()
      .mockResolvedValue({ upsertedCount: opts.upserted ?? 1 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: opts.deleted ?? 1 }),
    find: jest.fn(() => leanQuery(opts.favourites ?? [])),
    countDocuments: jest
      .fn()
      .mockResolvedValue(opts.total ?? (opts.favourites ?? []).length),
  };
  const hotelModel = {
    exists: jest
      .fn()
      .mockResolvedValue(opts.hotelExists === false ? null : { _id: hotelId }),
    find: jest.fn(() => leanQuery(opts.hotels ?? [])),
  };
  const itineraryModel = {
    exists: jest
      .fn()
      .mockResolvedValue(
        opts.itineraryExists === false ? null : { _id: itineraryId },
      ),
    find: jest.fn(() => leanQuery(opts.itineraries ?? [])),
  };
  const service = new FavouritesService(
    favouriteModel as never,
    hotelModel as never,
    itineraryModel as never,
  );
  return { service, favouriteModel, hotelModel, itineraryModel };
}

const user = userId.toString();

describe('FavouritesService.add', () => {
  it('saves an active hotel', async () => {
    const t = setup();
    const result = await t.service.add(user, 'hotel', hotelId.toString());

    expect(t.hotelModel.exists).toHaveBeenCalledWith({
      _id: hotelId,
      isActive: true,
    });
    expect(t.favouriteModel.updateOne).toHaveBeenCalledWith(
      { user: userId, itemType: 'hotel', item: hotelId },
      { $setOnInsert: { user: userId, itemType: 'hotel', item: hotelId } },
      { upsert: true },
    );
    expect(result).toEqual({
      type: 'hotel',
      id: hotelId.toString(),
      favourite: true,
      created: true,
    });
  });

  it('saves a Public, non-hidden itinerary', async () => {
    const t = setup();
    await t.service.add(user, 'itinerary', itineraryId.toString());
    expect(t.itineraryModel.exists).toHaveBeenCalledWith({
      _id: itineraryId,
      visibility: 'PUBLIC',
      isHidden: { $ne: true },
    });
  });

  it('does nothing when the item is already saved', async () => {
    const t = setup({ upserted: 0 });
    const result = await t.service.add(user, 'hotel', hotelId.toString());
    expect(result.created).toBe(false);
  });

  it('does not save a hotel that is missing or deactivated', async () => {
    const t = setup({ hotelExists: false });
    await expect(
      t.service.add(user, 'hotel', hotelId.toString()),
    ).rejects.toThrow('Hotel not found');
    expect(t.favouriteModel.updateOne).not.toHaveBeenCalled();
  });

  it('does not save a private, hidden or missing itinerary', async () => {
    const t = setup({ itineraryExists: false });
    await expect(
      t.service.add(user, 'itinerary', itineraryId.toString()),
    ).rejects.toThrow('Itinerary not found');
    expect(t.favouriteModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects an unknown type and an invalid id', async () => {
    const t = setup();
    await expect(
      t.service.add(user, 'flight', hotelId.toString()),
    ).rejects.toMatchObject({
      response: { errors: { type: ['Type must be hotel or itinerary'] } },
    });
    await expect(t.service.add(user, 'hotel', 'nope')).rejects.toMatchObject({
      response: { errors: { id: ['ID must be a valid ID'] } },
    });
  });
});

describe('FavouritesService.remove', () => {
  it('removes only the own favourite', async () => {
    const t = setup();
    const result = await t.service.remove(user, 'hotel', hotelId.toString());
    expect(t.favouriteModel.deleteOne).toHaveBeenCalledWith({
      user: userId,
      itemType: 'hotel',
      item: hotelId,
    });
    expect(result).toEqual({
      type: 'hotel',
      id: hotelId.toString(),
      favourite: false,
    });
  });

  it('reports a favourite that is not in the list', async () => {
    const t = setup({ deleted: 0 });
    await expect(
      t.service.remove(user, 'hotel', hotelId.toString()),
    ).rejects.toThrow('Favourite not found');
  });
});

describe('FavouritesService.list', () => {
  const fav = (type: string, item: Types.ObjectId, createdAt: string) => ({
    _id: new Types.ObjectId(),
    user: userId,
    itemType: type,
    item,
    createdAt: new Date(createdAt),
  });

  it('lists hotels and itineraries with their details, newest first', async () => {
    const t = setup({
      favourites: [
        fav('itinerary', itineraryId, '2026-12-02'),
        fav('hotel', hotelId, '2026-12-01'),
      ],
      hotels: [
        {
          _id: hotelId,
          name: 'Nile View',
          starRating: 4,
          averageRating: 4.3,
          images: ['a.jpg'],
          isActive: true,
        },
      ],
      itineraries: [
        {
          _id: itineraryId,
          title: 'Cairo to Luxor',
          countryIds: ['EG'],
          startDate: new Date('2027-02-01'),
          visibility: 'PUBLIC',
          isHidden: false,
        },
      ],
    });
    const result = await t.service.list(user, { page: 1 });

    expect(result).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    expect(result.items[0]).toMatchObject({
      type: 'itinerary',
      available: true,
      title: 'Cairo to Luxor',
      countryIds: ['EG'],
    });
    expect(result.items[1]).toMatchObject({
      type: 'hotel',
      available: true,
      name: 'Nile View',
      image: 'a.jpg',
    });
  });

  it('only reads the own favourites and filters by type', async () => {
    const t = setup();
    await t.service.list(user, { page: 1, type: 'hotel' as never });
    expect(t.favouriteModel.find).toHaveBeenCalledWith({
      user: userId,
      itemType: 'hotel',
    });
    expect(t.favouriteModel.countDocuments).toHaveBeenCalledWith({
      user: userId,
      itemType: 'hotel',
    });
  });

  it('pages 10 at a time', async () => {
    const t = setup({ total: 25 });
    const query = leanQuery([]);
    t.favouriteModel.find.mockReturnValue(query);
    const result = await t.service.list(user, { page: 3 });
    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 25, page: 3, totalPages: 3 });
  });

  it('shows no details for items that are no longer available', async () => {
    const t = setup({
      favourites: [
        fav('hotel', hotelId, '2026-12-01'),
        fav('itinerary', itineraryId, '2026-12-02'),
      ],
      hotels: [
        {
          _id: hotelId,
          name: 'Closed Hotel',
          starRating: 3,
          averageRating: 0,
          isActive: false,
        },
      ],
      itineraries: [
        {
          _id: itineraryId,
          title: 'Now private',
          countryIds: ['EG'],
          startDate: new Date('2027-02-01'),
          visibility: 'PRIVATE',
        },
      ],
    });
    const { items } = await t.service.list(user, { page: 1 });
    expect(items[0]).toEqual({
      type: 'hotel',
      id: hotelId.toString(),
      favouritedAt: new Date('2026-12-01'),
      available: false,
    });
    expect(items[1]).toEqual({
      type: 'itinerary',
      id: itineraryId.toString(),
      favouritedAt: new Date('2026-12-02'),
      available: false,
    });
  });

  it('marks a deleted item as unavailable', async () => {
    const t = setup({
      favourites: [fav('hotel', hotelId, '2026-12-01')],
      hotels: [],
    });
    const { items } = await t.service.list(user, { page: 1 });
    expect(items[0]).toMatchObject({ available: false });
  });

  it('skips the item queries when there is nothing of that type', async () => {
    const t = setup({
      favourites: [fav('hotel', hotelId, '2026-12-01')],
      hotels: [],
    });
    await t.service.list(user, { page: 1 });
    expect(t.itineraryModel.find).not.toHaveBeenCalled();
  });
});
