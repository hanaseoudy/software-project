
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { User } from '../users/schemas/user.schema';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { User } from '../users/schemas/user.schema';
import { UploadsService } from '../uploads/uploads.service';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { UserRole } from '../users/schemas/user.schema';
import { RoomStatusQueryDto } from './dto/room-status-query.dto';
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';
 
const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
// find() -> sort()/skip()/limit()/select()/lean() -> exec(), all returning the same value
const found = (value: unknown) => {
  const chain: Record<string, unknown> = {};
  for (const name of ['sort', 'skip', 'limit', 'select', 'lean']) {
    chain[name] = jest.fn(() => chain);
  }
  chain.exec = () => Promise.resolve(value);
  return chain;
};
 
const NOW = new Date('2026-11-15T10:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
 
describe('HotelsService.getRoomStatuses (HTL-08)', () => {
  let service: HotelsService;
  const hotelModel = { findById: jest.fn() };
  const roomModel = { find: jest.fn(), countDocuments: jest.fn() };
  const availabilityModel = { find: jest.fn() };
  const bookingModel = { find: jest.fn() };
  const assignmentModel = { exists: jest.fn() };
 
  const hotelId = new Types.ObjectId();
  const moderator = {
    sub: new Types.ObjectId().toString(),
    sid: 's1',
    role: UserRole.MODERATOR,
  };
 
  const query = (over: Partial<RoomStatusQueryDto> = {}) =>
    ({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      page: 1,
      ...over,
    }) as RoomStatusQueryDto;
 
  const makeRoom = (roomNumber = 'A101', isActive = true) => ({
    _id: new Types.ObjectId(),
    roomNumber,
    type: 'Double',
    isActive,
  });
  const range = (
    roomId: Types.ObjectId,
    type: 'available' | 'blocked',
    start: string,
    end: string,
  ) => ({ room: roomId, type, startDate: day(start), endDate: day(end) });
  const booking = (
    roomId: Types.ObjectId,
    checkIn: string,
    checkOut: string,
    over: Record<string, unknown> = {},
  ) => ({
    _id: new Types.ObjectId(),
    bookingReference: 'HB-1042',
    status: 'CONFIRMED',
    checkIn: day(checkIn),
    checkOut: day(checkOut),
    rooms: [{ room: roomId }],
    ...over,
  });
 
  const setup = (data: {
    rooms?: ReturnType<typeof makeRoom>[];
    total?: number;
    ranges?: unknown[];
    bookings?: unknown[];
  }) => {
    hotelModel.findById.mockReturnValue(
      execResult({ _id: hotelId, isActive: true }),
    );
    assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
    const rooms = data.rooms ?? [];
    roomModel.countDocuments.mockReturnValue(
      execResult(data.total ?? rooms.length),
    );
    roomModel.find.mockReturnValue(found(rooms));
    availabilityModel.find.mockReturnValue(found(data.ranges ?? []));
    bookingModel.find.mockReturnValue(found(data.bookings ?? []));
  };
  const run = (q = query()) =>
    service.getRoomStatuses(hotelId.toString(), q, moderator, NOW);
 
  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: roomModel },
        {
          provide: getModelToken(RoomAvailability.name),
          useValue: availabilityModel,
        },
        { provide: getModelToken(HotelBooking.name), useValue: bookingModel },
        { provide: getModelToken(City.name), useValue: {} },
        { provide: getModelToken(Country.name), useValue: {} },
        {
          provide: getModelToken(ModeratorAssignment.name),
          useValue: assignmentModel,
        },
        { provide: getModelToken(Review.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: UploadsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(HotelsService);
  });
 
  describe('access and validation', () => {
    it('returns 404 when the hotel does not exist', async () => {
      setup({});
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      setup({});
      assignmentModel.exists.mockReturnValue(execResult(null));
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
      expect(roomModel.find).not.toHaveBeenCalled();
    });
 
    const errorsOf = async (q: RoomStatusQueryDto) => {
      setup({});
      const error = await run(q).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      return (
        (error as BadRequestException).getResponse() as {
          errors: Record<string, string[]>;
        }
      ).errors;
    };
 
    it('rejects a start date that is not a real date', async () => {
      const errors = await errorsOf(query({ startDate: '2026-02-30' }));
      expect(errors.startDate).toEqual([
        'Start date must be a real date in YYYY-MM-DD format',
      ]);
    });
 
    it('rejects an end date that is not a real date', async () => {
      const errors = await errorsOf(query({ endDate: '2026-13-01' }));
      expect(errors.endDate).toEqual([
        'End date must be a real date in YYYY-MM-DD format',
      ]);
    });
 
    it('rejects an end date before the start date', async () => {
      const errors = await errorsOf(query({ endDate: '2026-11-30' }));
      expect(errors.endDate).toEqual([
        'End date must be on or after the start date',
      ]);
    });
 
    it('accepts a single day and dates in the past', async () => {
      setup({});
      await expect(
        run(query({ startDate: '2020-01-01', endDate: '2020-01-01' })),
      ).resolves.toMatchObject({ total: 0 });
    });
  });
 
  describe('room statuses', () => {
    it('returns an empty page when the hotel has no rooms', async () => {
      setup({ rooms: [] });
      await expect(run()).resolves.toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      expect(availabilityModel.find).not.toHaveBeenCalled();
      expect(bookingModel.find).not.toHaveBeenCalled();
    });
 
    it('shows Available, Blocked and Booked (with the reference) for a room', async () => {
      const room = makeRoom('A101');
      setup({
        rooms: [room],
        ranges: [
          range(room._id, 'available', '2026-12-01', '2026-12-31'),
          range(room._id, 'blocked', '2026-12-20', '2026-12-22'),
        ],
        bookings: [booking(room._id, '2026-12-10', '2026-12-14')],
      });
      const result = await run();
      expect(result.items).toEqual([
        {
          roomId: String(room._id),
          roomNumber: 'A101',
          type: 'Double',
          isActive: true,
          periods: [
            {
              status: 'AVAILABLE',
              startDate: '2026-12-01',
              endDate: '2026-12-09',
            },
            {
              status: 'BOOKED',
              startDate: '2026-12-10',
              endDate: '2026-12-13', // the check-out day 12-14 is not a night
              reservationReference: 'HB-1042',
              reservationStatus: 'CONFIRMED',
            },
            {
              status: 'AVAILABLE',
              startDate: '2026-12-14',
              endDate: '2026-12-19',
            },
            {
              status: 'BLOCKED',
              startDate: '2026-12-20',
              endDate: '2026-12-22',
            },
            {
              status: 'AVAILABLE',
              startDate: '2026-12-23',
              endDate: '2026-12-31',
            },
          ],
        },
      ]);
    });
 
    it('uses the reservation id when the booking has no reference yet', async () => {
      const room = makeRoom();
      const hold = booking(room._id, '2026-12-10', '2026-12-12', {
        bookingReference: undefined,
        status: 'PENDING_PAYMENT',
      });
      setup({
        rooms: [room],
        ranges: [range(room._id, 'available', '2026-12-01', '2026-12-31')],
        bookings: [hold],
      });
      const result = await run();
      expect(result.items[0].periods[1]).toEqual({
        status: 'BOOKED',
        startDate: '2026-12-10',
        endDate: '2026-12-11',
        reservationReference: String(hold._id),
        reservationStatus: 'PENDING_PAYMENT',
      });
    });
 
    it('shows each room with only its own ranges and reservations', async () => {
      const a = makeRoom('A101');
      const b = makeRoom('A102');
      setup({
        rooms: [a, b],
        ranges: [
          range(a._id, 'available', '2026-12-01', '2026-12-31'),
          range(b._id, 'blocked', '2026-12-01', '2026-12-05'),
        ],
        bookings: [booking(b._id, '2026-12-10', '2026-12-12')],
      });
      const result = await run();
      expect(result.items.map((r) => r.roomNumber)).toEqual(['A101', 'A102']);
      expect(result.items[0].periods).toEqual([
        { status: 'AVAILABLE', startDate: '2026-12-01', endDate: '2026-12-31' },
      ]);
      expect(result.items[1].periods.map((p) => p.status)).toEqual([
        'BLOCKED',
        'BOOKED',
      ]);
    });
 
    it('lists a reservation of several rooms on each of its rooms', async () => {
      const a = makeRoom('A101');
      const b = makeRoom('A102');
      setup({
        rooms: [a, b],
        bookings: [
          {
            ...booking(a._id, '2026-12-10', '2026-12-12'),
            rooms: [{ room: a._id }, { room: b._id }],
          },
        ],
      });
      const result = await run();
      for (const item of result.items) {
        expect(item.periods).toEqual([
          expect.objectContaining({
            status: 'BOOKED',
            reservationReference: 'HB-1042',
          }),
        ]);
      }
    });
 
    it('gives a room with nothing in the days an empty period list', async () => {
      const room = makeRoom();
      setup({ rooms: [room] });
      const result = await run();
      expect(result.items[0].periods).toEqual([]);
    });
 
    it('also lists a room that is not active, with its flag', async () => {
      const room = makeRoom('A101', false);
      setup({ rooms: [room] });
      const result = await run();
      expect(result.items[0].isActive).toBe(false);
    });
  });
 
  describe('what is asked from the database', () => {
    it('asks for the rooms of this hotel only, sorted by room number', async () => {
      setup({});
      await run();
      expect(roomModel.countDocuments).toHaveBeenCalledWith({
        hotel: hotelId,
      });
      expect(roomModel.find).toHaveBeenCalledWith({ hotel: hotelId });
    });
 
    it('asks for ranges and blocks that touch the chosen days', async () => {
      setup({ rooms: [makeRoom()] });
      await run();
      expect(availabilityModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: { $lte: day('2026-12-31') },
          endDate: { $gte: day('2026-12-01') },
        }),
      );
    });
 
    it('asks for Confirmed reservations and unexpired holds that touch the days', async () => {
      setup({ rooms: [makeRoom()] });
      await run();
      expect(bookingModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { status: 'CONFIRMED' },
            { status: 'PENDING_PAYMENT', holdExpiresAt: { $gt: NOW } },
          ],
          // a stay uses the nights from check-in up to, not including, check-out
          checkIn: { $lte: day('2026-12-31') },
          checkOut: { $gt: day('2026-12-01') },
        }),
      );
    });
  });
 
  describe('pagination (GEN-05)', () => {
    it('asks for 10 rooms and skips the earlier pages', async () => {
      setup({ rooms: [makeRoom()], total: 25 });
      const result = await run(query({ page: 3 }));
      const chain = roomModel.find.mock.results[0].value as {
        skip: jest.Mock;
        limit: jest.Mock;
      };
      expect(chain.skip).toHaveBeenCalledWith(20);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result).toMatchObject({
        total: 25,
        page: 3,
        pageSize: 10,
        totalPages: 3,
      });
    });
 
    it('returns an empty page after the last page but keeps the total', async () => {
      setup({ rooms: [], total: 12 });
      const result = await run(query({ page: 5 }));
      expect(result).toEqual({
        items: [],
        total: 12,
        page: 5,
        pageSize: 10,
        totalPages: 2,
      });
    });
  });
});
 
