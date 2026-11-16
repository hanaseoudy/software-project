
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { SearchHotelsQueryDto } from './dto/search-hotels-query.dto';
import { HotelSearchService } from './hotel-search.service';
import { Hotel } from './schemas/hotel.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';
 
// find() -> sort()/select()/lean() -> exec(), all returning the same value
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
 
describe('HotelSearchService', () => {
  let service: HotelSearchService;
  const hotelModel = { find: jest.fn() };
  const roomModel = { find: jest.fn() };
  const availabilityModel = { find: jest.fn() };
  const bookingModel = { find: jest.fn() };
 
  const cityId = new Types.ObjectId().toString();
  const countryId = new Types.ObjectId().toString();
 
  const query = (over: Partial<SearchHotelsQueryDto> = {}) =>
    ({
      city: cityId,
      checkIn: '2026-12-10',
      checkOut: '2026-12-14', // nights: 10, 11, 12, 13
      guests: 2,
      rooms: 1,
      page: 1,
      ...over,
    }) as SearchHotelsQueryDto;
 
  const makeHotel = (name = 'Nile Palace') => ({
    _id: new Types.ObjectId(),
    name,
    address: '1 Corniche',
    city: new Types.ObjectId(cityId),
    country: new Types.ObjectId(countryId),
    starRating: 5,
    images: ['/api/uploads/hotel/a.jpg'],
    averageRating: 4.5,
    reviewCount: 3,
  });
  const makeRoom = (
    hotelId: Types.ObjectId,
    maxOccupancy = 2,
    price = 100,
  ) => ({
    _id: new Types.ObjectId(),
    hotel: hotelId,
    maxOccupancy,
    pricePerNight: price,
  });
  const range = (
    roomId: Types.ObjectId,
    type: 'available' | 'blocked',
    start: string,
    end: string,
  ) => ({ room: roomId, type, startDate: day(start), endDate: day(end) });
  const covering = (roomId: Types.ObjectId) =>
    range(roomId, 'available', '2026-12-01', '2026-12-31');
 
  const setup = (data: {
    hotels: unknown[];
    rooms?: unknown[];
    ranges?: unknown[];
    bookings?: unknown[];
  }) => {
    hotelModel.find.mockReturnValue(found(data.hotels));
    roomModel.find.mockReturnValue(found(data.rooms ?? []));
    availabilityModel.find.mockReturnValue(found(data.ranges ?? []));
    bookingModel.find.mockReturnValue(found(data.bookings ?? []));
  };
  const run = (q = query()) => service.search(q, NOW);
 
  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelSearchService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: roomModel },
        {
          provide: getModelToken(RoomAvailability.name),
          useValue: availabilityModel,
        },
        { provide: getModelToken(HotelBooking.name), useValue: bookingModel },
      ],
    }).compile();
    service = moduleRef.get(HotelSearchService);
  });
 
  describe('validation', () => {
    const errorsOf = async (q: SearchHotelsQueryDto) => {
      setup({ hotels: [] });
      const error = await run(q).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      return (
        (error as BadRequestException).getResponse() as {
          errors: Record<string, string[]>;
        }
      ).errors;
    };
 
    it('needs a city or a country', async () => {
      const errors = await errorsOf(query({ city: undefined }));
      expect(errors.destination).toEqual(['Choose a city or a country']);
    });
 
    it('accepts a country on its own', async () => {
      setup({ hotels: [] });
      await expect(
        run(query({ city: undefined, country: countryId })),
      ).resolves.toBeDefined();
    });
 
    it('rejects check-out on the same day as check-in', async () => {
      const errors = await errorsOf(query({ checkOut: '2026-12-10' }));
      expect(errors.checkOut).toEqual(['Check-out must be after check-in']);
    });
 
    it('rejects check-out before check-in', async () => {
      const errors = await errorsOf(query({ checkOut: '2026-12-01' }));
      expect(errors).toHaveProperty('checkOut');
    });
 
    it('rejects a check-in in the past', async () => {
      const errors = await errorsOf(
        query({ checkIn: '2026-11-14', checkOut: '2026-11-16' }),
      );
      expect(errors.checkIn).toEqual(['Check-in cannot be in the past']);
    });
 
    it('accepts a check-in today', async () => {
      setup({ hotels: [] });
      await expect(
        run(query({ checkIn: '2026-11-15', checkOut: '2026-11-16' })),
      ).resolves.toBeDefined();
    });
 
    it.each(['2026-02-30', '2026-13-01'])(
      'rejects %s because it is not a real day',
      async (value) => {
        const errors = await errorsOf(query({ checkIn: value }));
        expect(errors).toHaveProperty('checkIn');
      },
    );
 
    it('does not search the database when the input is invalid', async () => {
      await errorsOf(query({ checkOut: '2026-12-10' }));
      expect(hotelModel.find).not.toHaveBeenCalled();
    });
  });
 
  describe('which hotels are searched', () => {
    it('only looks at active hotels of the chosen city and country', async () => {
      setup({ hotels: [] });
      await run(query({ country: countryId }));
      expect(hotelModel.find).toHaveBeenCalledWith({
        isActive: true,
        city: cityId,
        country: countryId,
      });
    });
 
    it('only looks at active rooms of those hotels', async () => {
      const hotel = makeHotel();
      setup({ hotels: [hotel] });
      await run();
      expect(roomModel.find).toHaveBeenCalledWith({
        hotel: { $in: [hotel._id] },
        isActive: true,
      });
    });
 
    it('returns an empty page without looking at rooms when no hotel matches', async () => {
      setup({ hotels: [] });
      const result = await run();
      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      expect(roomModel.find).not.toHaveBeenCalled();
    });
 
    it('asks for ranges and reservations that touch the stay', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({ hotels: [hotel], rooms: [room] });
      await run();
      expect(availabilityModel.find).toHaveBeenCalledWith({
        room: { $in: [room._id] },
        startDate: { $lt: day('2026-12-14') },
        endDate: { $gte: day('2026-12-10') },
      });
      expect(bookingModel.find).toHaveBeenCalledWith({
        'rooms.room': { $in: [room._id] },
        $or: [
          { status: 'CONFIRMED' },
          { status: 'PENDING_PAYMENT', holdExpiresAt: { $gt: NOW } },
        ],
        checkIn: { $lt: day('2026-12-14') },
        checkOut: { $gt: day('2026-12-10') },
      });
    });
  });
 
  describe('free rooms', () => {
    it('lists a hotel with a free room and describes it', async () => {
      const hotel = makeHotel();
      const cheap = makeRoom(hotel._id, 2, 80);
      const dear = makeRoom(hotel._id, 3, 150);
      setup({
        hotels: [hotel],
        rooms: [dear, cheap],
        ranges: [covering(dear._id), covering(cheap._id)],
      });
 
      const result = await run();
 
      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        id: String(hotel._id),
        name: 'Nile Palace',
        address: '1 Corniche',
        city: cityId,
        country: countryId,
        starRating: 5,
        image: '/api/uploads/hotel/a.jpg',
        averageRating: 4.5,
        reviewCount: 3,
        availableRooms: 2,
        lowestPricePerNight: 80,
      });
    });
 
    it('returns a null image for a hotel without photos', async () => {
      const hotel = { ...makeHotel(), images: [] };
      const room = makeRoom(hotel._id);
      setup({ hotels: [hotel], rooms: [room], ranges: [covering(room._id)] });
      expect((await run()).items[0].image).toBeNull();
    });
 
    it('skips a room with no bookable range', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({ hotels: [hotel], rooms: [room], ranges: [] });
      expect((await run()).total).toBe(0);
    });
 
    it('skips a room whose bookable range stops before the last night', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [range(room._id, 'available', '2026-12-01', '2026-12-12')],
      });
      expect((await run()).total).toBe(0);
    });
 
    it('skips a room whose bookable range starts after check-in', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [range(room._id, 'available', '2026-12-11', '2026-12-31')],
      });
      expect((await run()).total).toBe(0);
    });
 
    it('accepts a stay that ends on the last bookable day (check-out the day after)', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [range(room._id, 'available', '2026-12-10', '2026-12-13')],
      });
      expect((await run()).total).toBe(1);
    });
 
    it('joins two bookable ranges that touch', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [
          range(room._id, 'available', '2026-12-11', '2026-12-20'),
          range(room._id, 'available', '2026-12-01', '2026-12-10'),
        ],
      });
      expect((await run()).total).toBe(1);
    });
 
    it('does not join two bookable ranges with a gap', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [
          range(room._id, 'available', '2026-12-01', '2026-12-10'),
          range(room._id, 'available', '2026-12-12', '2026-12-20'),
        ],
      });
      expect((await run()).total).toBe(0);
    });
 
    it('skips a room with a blocked range inside the stay', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [
          covering(room._id),
          range(room._id, 'blocked', '2026-12-12', '2026-12-12'),
        ],
      });
      expect((await run()).total).toBe(0);
    });
 
    it('skips a room taken by a reservation or an unexpired hold', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [room],
        ranges: [covering(room._id)],
        bookings: [{ rooms: [{ room: room._id }] }],
      });
      expect((await run()).total).toBe(0);
    });
 
    it('keeps the hotel when only some of its rooms are taken', async () => {
      const hotel = makeHotel();
      const taken = makeRoom(hotel._id);
      const free = makeRoom(hotel._id, 2, 90);
      setup({
        hotels: [hotel],
        rooms: [taken, free],
        ranges: [covering(taken._id), covering(free._id)],
        bookings: [{ rooms: [{ room: taken._id }] }],
      });
      const result = await run();
      expect(result.items[0].availableRooms).toBe(1);
      expect(result.items[0].lowestPricePerNight).toBe(90);
    });
 
    it('does not mix up rooms of different hotels', async () => {
      const a = makeHotel('A hotel');
      const b = makeHotel('B hotel');
      const roomOfA = makeRoom(a._id);
      const roomOfB = makeRoom(b._id);
      setup({
        hotels: [a, b],
        rooms: [roomOfA, roomOfB],
        ranges: [covering(roomOfB._id)],
      });
      const result = await run();
      expect(result.items.map((i) => i.name)).toEqual(['B hotel']);
    });
  });
 
  describe('rooms and guests', () => {
    it('defaults to one room', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({ hotels: [hotel], rooms: [room], ranges: [covering(room._id)] });
      expect((await run(query({ rooms: undefined }))).total).toBe(1);
    });
 
    it('needs at least as many free rooms as asked for', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id);
      setup({ hotels: [hotel], rooms: [room], ranges: [covering(room._id)] });
      expect((await run(query({ rooms: 2 }))).total).toBe(0);
    });
 
    it('accepts a hotel with exactly the number of free rooms asked for', async () => {
      const hotel = makeHotel();
      const r1 = makeRoom(hotel._id);
      const r2 = makeRoom(hotel._id);
      setup({
        hotels: [hotel],
        rooms: [r1, r2],
        ranges: [covering(r1._id), covering(r2._id)],
      });
      expect((await run(query({ rooms: 2 }))).total).toBe(1);
    });
 
    it('rejects a hotel when the guests do not fit in one room', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id, 2);
      setup({ hotels: [hotel], rooms: [room], ranges: [covering(room._id)] });
      expect((await run(query({ guests: 3 }))).total).toBe(0);
    });
 
    it('accepts guests equal to the maximum occupancy', async () => {
      const hotel = makeHotel();
      const room = makeRoom(hotel._id, 3);
      setup({ hotels: [hotel], rooms: [room], ranges: [covering(room._id)] });
      expect((await run(query({ guests: 3 }))).total).toBe(1);
    });
 
    it('adds up the occupancy of the rooms asked for', async () => {
      const hotel = makeHotel();
      const r1 = makeRoom(hotel._id, 2);
      const r2 = makeRoom(hotel._id, 2);
      setup({
        hotels: [hotel],
        rooms: [r1, r2],
        ranges: [covering(r1._id), covering(r2._id)],
      });
      expect((await run(query({ rooms: 2, guests: 4 }))).total).toBe(1);
      expect((await run(query({ rooms: 2, guests: 5 }))).total).toBe(0);
    });
 
    it('uses the largest free rooms for the combined occupancy', async () => {
      const hotel = makeHotel();
      const rooms = [1, 4, 2].map((occupancy) =>
        makeRoom(hotel._id, occupancy),
      );
      setup({
        hotels: [hotel],
        rooms,
        ranges: rooms.map((r) => covering(r._id)),
      });
      expect((await run(query({ rooms: 2, guests: 6 }))).total).toBe(1);
      expect((await run(query({ rooms: 2, guests: 7 }))).total).toBe(0);
    });
  });
 
  describe('pagination', () => {
    const manyHotels = (count: number) => {
      const hotels = Array.from({ length: count }, (_, i) =>
        makeHotel(`Hotel ${String(i).padStart(2, '0')}`),
      );
      const rooms = hotels.map((h) => makeRoom(h._id));
      setup({
        hotels,
        rooms,
        ranges: rooms.map((r) => covering(r._id)),
      });
      return hotels;
    };
 
    it('returns 10 hotels per page with the totals', async () => {
      manyHotels(12);
      const result = await run(query({ page: 1 }));
      expect(result.items).toHaveLength(10);
      expect(result).toMatchObject({
        total: 12,
        page: 1,
        pageSize: 10,
        totalPages: 2,
      });
    });
 
    it('returns the rest on the next page', async () => {
      const hotels = manyHotels(12);
      const result = await run(query({ page: 2 }));
      expect(result.items.map((i) => i.id)).toEqual([
        String(hotels[10]._id),
        String(hotels[11]._id),
      ]);
    });
 
    it('returns an empty list for a page past the end', async () => {
      manyHotels(3);
      const result = await run(query({ page: 5 }));
      expect(result.items).toEqual([]);
      expect(result.total).toBe(3);
    });
  });
});
 
