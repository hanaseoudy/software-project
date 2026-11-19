import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import {
  HotelSortBy,
  SearchHotelsQueryDto,
  SortOrder,
} from './dto/search-hotels-query.dto';
import { HotelSearchService } from './hotel-search.service';
import { Hotel } from './schemas/hotel.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';

const found = (value: unknown) => {
  const chain: Record<string, unknown> = {};
  chain.sort = () => chain;
  chain.select = () => chain;
  chain.lean = () => chain;
  chain.exec = () => Promise.resolve(value);
  return chain;
};

const NOW = new Date('2026-11-15T10:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('HotelSearchService filters and sorting (HTL-12)', () => {
  let service: HotelSearchService;
  const hotelModel = { find: jest.fn() };
  const roomModel = { find: jest.fn() };
  const availabilityModel = { find: jest.fn() };
  const bookingModel = { find: jest.fn() };
  const cityId = new Types.ObjectId().toString();

  const query = (over: Partial<SearchHotelsQueryDto> = {}) =>
    ({
      city: cityId,
      checkIn: '2026-12-10',
      checkOut: '2026-12-14',
      guests: 2,
      rooms: 1,
      page: 1,
      ...over,
    }) as SearchHotelsQueryDto;

  const hotel = (name: string, averageRating: number, reviewCount: number) => ({
    _id: new Types.ObjectId(),
    name,
    address: '1 Corniche',
    city: new Types.ObjectId(cityId),
    country: new Types.ObjectId(),
    starRating: 4,
    images: [],
    averageRating,
    reviewCount,
  });
  // One free room per price. The hotel is shown with the price of its cheapest free room.
  const setup = (entries: { hotel: ReturnType<typeof hotel>; prices: number[] }[]) => {
    const rooms = entries.flatMap((e) =>
      e.prices.map((price) => ({
        _id: new Types.ObjectId(),
        hotel: e.hotel._id,
        maxOccupancy: 2,
        pricePerNight: price,
      })),
    );
    hotelModel.find.mockReturnValue(found(entries.map((e) => e.hotel)));
    roomModel.find.mockReturnValue(found(rooms));
    availabilityModel.find.mockReturnValue(
      found(
        rooms.map((r) => ({
          room: r._id,
          type: 'available',
          startDate: day('2026-12-01'),
          endDate: day('2026-12-31'),
        })),
      ),
    );
    bookingModel.find.mockReturnValue(found([]));
  };
  const names = async (q: SearchHotelsQueryDto) =>
    (await service.search(q, NOW)).items.map((h) => h.name);

  // A: 100 (4.8 stars, 10 ratings)   B: 300 cheapest of two rooms (3.0, 4)   C: 200 (unrated)   D: 300 (4.0, 7)
  const standard = () =>
    setup([
      { hotel: hotel('A', 4.8, 10), prices: [100] },
      { hotel: hotel('B', 3.0, 4), prices: [900, 300] },
      { hotel: hotel('C', 0, 0), prices: [200] },
      { hotel: hotel('D', 4.0, 7), prices: [300] },
    ]);

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelSearchService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: roomModel },
        { provide: getModelToken(RoomAvailability.name), useValue: availabilityModel },
        { provide: getModelToken(HotelBooking.name), useValue: bookingModel },
      ],
    }).compile();
    service = moduleRef.get(HotelSearchService);
    standard();
  });

  it('keeps the name order when no filter or sort is given', async () => {
    expect(await names(query())).toEqual(['A', 'B', 'C', 'D']);
  });

  describe('price range (on the cheapest free room, both ends included)', () => {
    it('includes hotels priced exactly at the minimum and the maximum', async () => {
      expect(await names(query({ minPrice: 200, maxPrice: 300 }))).toEqual(['B', 'C', 'D']);
    });

    it('works with only a minimum or only a maximum', async () => {
      expect(await names(query({ minPrice: 250 }))).toEqual(['B', 'D']);
      expect(await names(query({ maxPrice: 150 }))).toEqual(['A']);
    });

    it('judges a hotel by its cheapest room, not its other rooms', async () => {
      // B also has a 900 room, but its cheapest free room (300) is what counts
      expect(await names(query({ maxPrice: 300, minPrice: 300 }))).toEqual(['B', 'D']);
    });

    it('returns an empty page when nothing is in range', async () => {
      const page = await service.search(query({ minPrice: 1000 }), NOW);
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    });

    it('rejects a maximum below the minimum', async () => {
      const error = await service
        .search(query({ minPrice: 300, maxPrice: 100 }), NOW)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(
        ((error as BadRequestException).getResponse() as { errors: Record<string, string[]> }).errors.maxPrice,
      ).toEqual(['Maximum price cannot be less than minimum price']);
    });
  });

  describe('minimum rating', () => {
    it('keeps hotels at or above the rating and leaves out unrated hotels', async () => {
      expect(await names(query({ minRating: 4 }))).toEqual(['A', 'D']);
    });

    it('leaves out unrated hotels even for the lowest rating filter', async () => {
      expect(await names(query({ minRating: 1 }))).toEqual(['A', 'B', 'D']);
    });

    it('keeps unrated hotels when no rating filter is set', async () => {
      expect(await names(query({ minPrice: 200, maxPrice: 200 }))).toEqual(['C']);
    });

    it('combines the price range and the rating', async () => {
      expect(await names(query({ minPrice: 150, minRating: 3.5 }))).toEqual(['D']);
    });
  });

  describe('sorting', () => {
    it('sorts by price ascending with the hotel name breaking ties', async () => {
      expect(await names(query({ sortBy: HotelSortBy.PRICE, sortOrder: SortOrder.ASC }))).toEqual([
        'A', 'C', 'B', 'D',
      ]);
    });

    it('sorts by price descending, still breaking ties by name', async () => {
      expect(await names(query({ sortBy: HotelSortBy.PRICE, sortOrder: SortOrder.DESC }))).toEqual([
        'B', 'D', 'C', 'A',
      ]);
    });

    it('sorts by rating descending with unrated hotels last', async () => {
      expect(await names(query({ sortBy: HotelSortBy.RATING, sortOrder: SortOrder.DESC }))).toEqual([
        'A', 'D', 'B', 'C',
      ]);
    });

    it('sorts by rating ascending with unrated hotels still last', async () => {
      expect(await names(query({ sortBy: HotelSortBy.RATING, sortOrder: SortOrder.ASC }))).toEqual([
        'B', 'D', 'A', 'C',
      ]);
    });

    it('sorts the filtered list and paginates it afterwards', async () => {
      setup(
        Array.from({ length: 12 }, (_, i) => ({
          hotel: hotel(`H${String(i).padStart(2, '0')}`, 4, 2),
          prices: [100 + i],
        })),
      );
      const q = { sortBy: HotelSortBy.PRICE, sortOrder: SortOrder.DESC, minPrice: 102 };
      const page1 = await service.search(query({ ...q, page: 1 }), NOW);
      const page2 = await service.search(query({ ...q, page: 2 }), NOW);
      expect(page1.total).toBe(10); // prices 102..111
      expect(page1.items.map((h) => h.lowestPricePerNight)).toEqual([111, 110, 109, 108, 107, 106, 105, 104, 103, 102]);
      expect(page2.items).toEqual([]);
    });
  });
});
