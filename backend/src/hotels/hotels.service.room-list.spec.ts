import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { UploadsService } from '../uploads/uploads.service';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { User, UserRole } from '../users/schemas/user.schema';
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
// find() -> collation()/sort()/skip()/limit() -> exec(), all returning the same value
const found = (value: unknown) => {
  const chain: Record<string, unknown> = {};
  for (const name of ['collation', 'sort', 'skip', 'limit']) {
    chain[name] = jest.fn(() => chain);
  }
  chain.exec = () => Promise.resolve(value);
  return chain;
};
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('HotelsService.listRooms (BE-4: HTL-03, HTL-05, HTL-06)', () => {
  let service: HotelsService;
  const hotelModel = { findById: jest.fn() };
  const roomModel = { find: jest.fn(), countDocuments: jest.fn() };
  const availabilityModel = { find: jest.fn() };
  const assignmentModel = { exists: jest.fn() };

  const hotelId = new Types.ObjectId();
  const moderator = {
    sub: new Types.ObjectId().toString(),
    sid: 's1',
    role: UserRole.MODERATOR,
  };

  const makeRoom = (roomNumber: string, isActive = true) => ({
    _id: new Types.ObjectId(),
    hotel: hotelId,
    roomNumber,
    type: 'Double',
    beds: 2,
    maxOccupancy: 3,
    pricePerNight: 120,
    currency: 'USD',
    isActive,
  });
  const range = (
    roomId: Types.ObjectId,
    type: 'available' | 'blocked',
    start: string,
    end: string,
  ) => ({
    _id: new Types.ObjectId(),
    room: roomId,
    hotel: hotelId,
    type,
    startDate: day(start),
    endDate: day(end),
  });

  const setup = (data: {
    rooms?: ReturnType<typeof makeRoom>[];
    total?: number;
    ranges?: unknown[];
  }) => {
    hotelModel.findById.mockReturnValue(execResult({ _id: hotelId }));
    assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
    const rooms = data.rooms ?? [];
    roomModel.countDocuments.mockReturnValue(
      execResult(data.total ?? rooms.length),
    );
    roomModel.find.mockReturnValue(found(rooms));
    availabilityModel.find.mockReturnValue(found(data.ranges ?? []));
  };

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
        { provide: getModelToken(HotelBooking.name), useValue: {} },
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

  it('returns 404 when the hotel id is not a valid id', async () => {
    await expect(
      service.listRooms('not-an-id', 1, moderator),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when the hotel does not exist', async () => {
    setup({});
    hotelModel.findById.mockReturnValue(execResult(null));
    await expect(
      service.listRooms(hotelId.toString(), 1, moderator),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 403 when the moderator is not assigned to this hotel', async () => {
    setup({ rooms: [makeRoom('A101')] });
    assignmentModel.exists.mockReturnValue(execResult(null));
    await expect(
      service.listRooms(hotelId.toString(), 1, moderator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(roomModel.find).not.toHaveBeenCalled();
  });

  it('GEN-05: returns an empty page without loading ranges when the hotel has no rooms', async () => {
    setup({ rooms: [] });
    await expect(
      service.listRooms(hotelId.toString(), 1, moderator),
    ).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
    expect(availabilityModel.find).not.toHaveBeenCalled();
  });

  it('lists only rooms of this hotel, sorted by room number numerically, 10 per page', async () => {
    setup({ rooms: [makeRoom('A101')], total: 11 });
    const result = await service.listRooms(hotelId.toString(), 2, moderator);

    expect(roomModel.find).toHaveBeenCalledWith({ hotel: hotelId });
    const chain = roomModel.find.mock.results[0].value as Record<string, jest.Mock>;
    expect(chain.collation).toHaveBeenCalledWith({
      locale: 'en',
      numericOrdering: true,
    });
    expect(chain.sort).toHaveBeenCalledWith({ roomNumber: 1, _id: 1 });
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 11, page: 2, pageSize: 10, totalPages: 2 });
  });

  it('includes deactivated rooms and splits each room\'s ranges into bookable ranges and blocks', async () => {
    const a = makeRoom('A101');
    const b = makeRoom('B202', false);
    const aRange = range(a._id, 'available', '2026-12-01', '2026-12-31');
    const aBlock = range(a._id, 'blocked', '2026-12-10', '2026-12-12');
    const bRange = range(b._id, 'available', '2027-01-01', '2027-01-15');
    setup({ rooms: [a, b], ranges: [aRange, aBlock, bRange] });

    const result = await service.listRooms(hotelId.toString(), 1, moderator);

    expect(result.items).toEqual([
      {
        id: a._id.toString(),
        hotelId: hotelId.toString(),
        roomNumber: 'A101',
        type: 'Double',
        beds: 2,
        maxOccupancy: 3,
        pricePerNight: 120,
        currency: 'USD',
        isActive: true,
        availabilityRanges: [
          {
            id: aRange._id.toString(),
            roomId: a._id.toString(),
            hotelId: hotelId.toString(),
            type: 'available',
            startDate: '2026-12-01',
            endDate: '2026-12-31',
          },
        ],
        blocks: [
          {
            id: aBlock._id.toString(),
            roomId: a._id.toString(),
            hotelId: hotelId.toString(),
            type: 'blocked',
            startDate: '2026-12-10',
            endDate: '2026-12-12',
          },
        ],
      },
      expect.objectContaining({
        id: b._id.toString(),
        isActive: false,
        availabilityRanges: [
          expect.objectContaining({ id: bRange._id.toString() }),
        ],
        blocks: [],
      }),
    ]);
    expect(availabilityModel.find).toHaveBeenCalledWith({
      room: { $in: [a._id, b._id] },
    });
  });
});
