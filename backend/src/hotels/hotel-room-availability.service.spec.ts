import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { AvailableRoomsQueryDto } from './dto/available-rooms-query.dto';
import { HotelRoomAvailabilityService } from './hotel-room-availability.service';
import { Hotel } from './schemas/hotel.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';

// find()/findOne() -> sort()/select()/lean() -> exec(), all returning the same value
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

describe('HotelRoomAvailabilityService', () => {
  let service: HotelRoomAvailabilityService;
  const hotelModel = { findOne: jest.fn() };
  const roomModel = { find: jest.fn() };
  const availabilityModel = { find: jest.fn() };
  const bookingModel = { find: jest.fn() };

  const hotelId = new Types.ObjectId();

  const query = (over: Partial<AvailableRoomsQueryDto> = {}) =>
    ({
      checkIn: '2026-12-10',
      checkOut: '2026-12-14', // nights: 10, 11, 12, 13
      page: 1,
      ...over,
    }) as AvailableRoomsQueryDto;

  const makeRoom = (roomNumber = 'A101', price = 100, maxOccupancy = 3) => ({
    _id: new Types.ObjectId(),
    roomNumber,
    type: 'Double',
    beds: 2,
    maxOccupancy,
    pricePerNight: price,
    currency: 'USD',
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
    hotel?: unknown;
    rooms?: unknown[];
    ranges?: unknown[];
    bookings?: unknown[];
  }) => {
    hotelModel.findOne.mockReturnValue(
      found('hotel' in data ? data.hotel : { _id: hotelId }),
    );
    roomModel.find.mockReturnValue(found(data.rooms ?? []));
    availabilityModel.find.mockReturnValue(found(data.ranges ?? []));
    bookingModel.find.mockReturnValue(found(data.bookings ?? []));
  };
  const run = (q = query(), id = hotelId.toString()) =>
    service.findAvailable(id, q, NOW);

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelRoomAvailabilityService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: roomModel },
        {
          provide: getModelToken(RoomAvailability.name),
          useValue: availabilityModel,
        },
        { provide: getModelToken(HotelBooking.name), useValue: bookingModel },
      ],
    }).compile();
    service = moduleRef.get(HotelRoomAvailabilityService);
  });

  describe('hotel lookup', () => {
    it('returns 404 for an id that is not a valid id', async () => {
      setup({});
      await expect(run(query(), 'not-an-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(hotelModel.findOne).not.toHaveBeenCalled();
    });

    it('returns 404 when the hotel does not exist or is not active', async () => {
      setup({ hotel: null });
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(hotelModel.findOne).toHaveBeenCalledWith({
        _id: hotelId.toString(),
        isActive: true,
      });
    });
  });

  describe('validation', () => {
    const errorsOf = async (q: AvailableRoomsQueryDto) => {
      setup({});
      const error = await run(q).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      return (
        (error as BadRequestException).getResponse() as {
          errors: Record<string, string[]>;
        }
      ).errors;
    };

    it('rejects a check-in that is not a real date', async () => {
      const errors = await errorsOf(query({ checkIn: '2026-02-30' }));
      expect(errors.checkIn).toEqual([
        'Check-in must be a real date in YYYY-MM-DD format',
      ]);
    });

    it('rejects a check-in in the past', async () => {
      const errors = await errorsOf(query({ checkIn: '2026-11-14' }));
      expect(errors.checkIn).toEqual(['Check-in cannot be in the past']);
    });

    it('rejects a check-out on or before the check-in', async () => {
      const same = await errorsOf(query({ checkOut: '2026-12-10' }));
      expect(same.checkOut).toEqual(['Check-out must be after check-in']);
      const before = await errorsOf(query({ checkOut: '2026-12-09' }));
      expect(before.checkOut).toEqual(['Check-out must be after check-in']);
    });

    it('reports a bad check-in and a bad check-out together', async () => {
      const errors = await errorsOf(
        query({ checkIn: 'x', checkOut: '2026-13-01' }),
      );
      expect(Object.keys(errors).sort()).toEqual(['checkIn', 'checkOut']);
    });

    it('accepts a check-in of today', async () => {
      setup({});
      await expect(
        run(query({ checkIn: '2026-11-15', checkOut: '2026-11-16' })),
      ).resolves.toMatchObject({ total: 0 });
    });
  });

  describe('free rooms', () => {
    it('lists a free room with its stay price (nights x price)', async () => {
      const room = makeRoom('A101', 120.5);
      setup({ rooms: [room], ranges: [covering(room._id)] });
      const result = await run();
      expect(result).toEqual({
        items: [
          {
            id: String(room._id),
            roomNumber: 'A101',
            type: 'Double',
            beds: 2,
            maxOccupancy: 3,
            pricePerNight: 120.5,
            currency: 'USD',
            nights: 4,
            totalStayPrice: 482,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
    });

    it('counts one night when check-out is the next day', async () => {
      const room = makeRoom('A101', 80);
      setup({ rooms: [room], ranges: [covering(room._id)] });
      const result = await run(query({ checkOut: '2026-12-11' }));
      expect(result.items[0]).toMatchObject({
        nights: 1,
        totalStayPrice: 80,
      });
    });

    it('rounds the stay price to cents', async () => {
      const room = makeRoom('A101', 33.33);
      setup({ rooms: [room], ranges: [covering(room._id)] });
      const result = await run(query({ checkOut: '2026-12-13' })); // 3 nights
      expect(result.items[0].totalStayPrice).toBe(99.99);
    });

    it('only asks for the active rooms of this hotel', async () => {
      setup({});
      await run();
      expect(roomModel.find).toHaveBeenCalledWith({
        hotel: hotelId,
        isActive: true,
      });
    });

    it('returns an empty page when the hotel has no active rooms', async () => {
      setup({ rooms: [] });
      await expect(run()).resolves.toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      expect(availabilityModel.find).not.toHaveBeenCalled();
    });

    it('leaves out a room with no bookable range', async () => {
      const room = makeRoom();
      setup({ rooms: [room], ranges: [] });
      await expect(run()).resolves.toMatchObject({ total: 0 });
    });

    it('leaves out a room whose bookable range ends before the last night', async () => {
      const room = makeRoom();
      setup({
        rooms: [room],
        ranges: [range(room._id, 'available', '2026-12-01', '2026-12-12')],
      });
      await expect(run()).resolves.toMatchObject({ total: 0 });
    });

    it('lists a room whose bookable range ends on the last night', async () => {
      const room = makeRoom();
      setup({
        rooms: [room],
        ranges: [range(room._id, 'available', '2026-12-01', '2026-12-13')],
      });
      await expect(run()).resolves.toMatchObject({ total: 1 });
    });

    it('joins ranges that touch each other', async () => {
      const room = makeRoom();
      setup({
        rooms: [room],
        ranges: [
          range(room._id, 'available', '2026-12-01', '2026-12-11'),
          range(room._id, 'available', '2026-12-12', '2026-12-31'),
        ],
      });
      await expect(run()).resolves.toMatchObject({ total: 1 });
    });

    it('leaves out a room with a gap between its ranges', async () => {
      const room = makeRoom();
      setup({
        rooms: [room],
        ranges: [
          range(room._id, 'available', '2026-12-01', '2026-12-10'),
          range(room._id, 'available', '2026-12-12', '2026-12-31'),
        ],
      });
      await expect(run()).resolves.toMatchObject({ total: 0 });
    });

    it('leaves out a blocked room', async () => {
      const blocked = makeRoom('A101');
      const free = makeRoom('A102');
      setup({
        rooms: [blocked, free],
        ranges: [
          covering(blocked._id),
          range(blocked._id, 'blocked', '2026-12-12', '2026-12-12'),
          covering(free._id),
        ],
      });
      const result = await run();
      expect(result.items.map((r) => r.roomNumber)).toEqual(['A102']);
    });

    it('leaves out a room that has a Confirmed reservation or an unexpired hold', async () => {
      const taken = makeRoom('A101');
      const free = makeRoom('A102');
      setup({
        rooms: [taken, free],
        ranges: [covering(taken._id), covering(free._id)],
        bookings: [{ rooms: [{ room: taken._id }] }],
      });
      const result = await run();
      expect(result.items.map((r) => r.roomNumber)).toEqual(['A102']);
    });

    it('asks only for reservations that overlap the stay and still hold the room', async () => {
      setup({ rooms: [makeRoom()] });
      await run();
      expect(bookingModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { status: 'CONFIRMED' },
            { status: 'PENDING_PAYMENT', holdExpiresAt: { $gt: NOW } },
          ],
          checkIn: { $lt: day('2026-12-14') },
          checkOut: { $gt: day('2026-12-10') },
        }),
      );
    });

    it('asks only for ranges that touch the stay', async () => {
      setup({ rooms: [makeRoom()] });
      await run();
      expect(availabilityModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: { $lt: day('2026-12-14') },
          endDate: { $gte: day('2026-12-10') },
        }),
      );
    });
  });

  describe('pagination (GEN-05)', () => {
    const twelveRooms = () => {
      const rooms = Array.from({ length: 12 }, (_, i) =>
        makeRoom(`R${String(i + 1).padStart(2, '0')}`),
      );
      setup({ rooms, ranges: rooms.map((r) => covering(r._id)) });
      return rooms;
    };

    it('returns 10 rooms on page 1', async () => {
      twelveRooms();
      const result = await run(query({ page: 1 }));
      expect(result.items).toHaveLength(10);
      expect(result).toMatchObject({ total: 12, page: 1, totalPages: 2 });
    });

    it('returns the remaining rooms on page 2', async () => {
      twelveRooms();
      const result = await run(query({ page: 2 }));
      expect(result.items.map((r) => r.roomNumber)).toEqual(['R11', 'R12']);
    });

    it('returns an empty page after the last page', async () => {
      twelveRooms();
      const result = await run(query({ page: 3 }));
      expect(result.items).toEqual([]);
      expect(result.total).toBe(12);
    });
  });
});
