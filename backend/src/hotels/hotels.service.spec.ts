
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { User, UserRole } from '../users/schemas/user.schema';
import { UploadsService } from '../uploads/uploads.service';
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';
import { Room } from './schemas/room.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
 
const referenceResult = (value: unknown) => ({ select: () => ({ lean: async () => value }) });
 
const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
 
// A query that supports .sort().limit().select().lean().exec() chains.
const chain = <T>(value: T) => {
  const q: Record<string, unknown> = {};
  for (const m of ['sort', 'limit', 'select', 'lean']) q[m] = () => q;
  q.exec = () => Promise.resolve(value);
  return q;
};
 
const makeHotelDoc = () => {
  const doc: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    name: 'Nile Palace',
    description: '',
    address: '1 Corniche',
    city: new Types.ObjectId(),
    country: new Types.ObjectId(),
    starRating: 5,
    amenities: [],
    images: [],
    checkInTime: '14:00',
    checkOutTime: '12:00',
    averageRating: 0,
    reviewCount: 0,
    isActive: true,
  };
  doc.set = jest.fn((changes: Record<string, unknown>) =>
    Object.assign(doc, changes),
  );
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};
 
describe('HotelsService', () => {
  let service: HotelsService;
  const hotelModel = { create: jest.fn(), findById: jest.fn() };
  const roomModel = {
    find: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
  };
  const availabilityModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const cityModel = { exists: jest.fn(), findById: jest.fn() };
  const countryModel = { exists: jest.fn(), findById: jest.fn() };
  const assignmentModel = { exists: jest.fn() };
  const bookingModel = { exists: jest.fn(), find: jest.fn() };
  const reviewModel = { find: jest.fn() };
  const userModel = { find: jest.fn() };
  // GEN-08: only /api/uploads/hotel/<uuid>.jpg|png links count as uploaded photos
  const uploads = { storedFileExists: jest.fn() };
 
  const moderator = {
    sub: new Types.ObjectId().toString(),
    role: UserRole.MODERATOR,
  };
  const createDto = {
    name: 'Nile Palace',
    address: '1 Corniche',
    city: new Types.ObjectId().toString(),
    country: new Types.ObjectId().toString(),
    starRating: 5,
  };
 
  beforeEach(async () => {
    jest.resetAllMocks();
    cityModel.findById.mockReturnValue(referenceResult({ countryCode: 'EG' }));
    countryModel.findById.mockReturnValue(referenceResult({ code: 'EG' }));
    uploads.storedFileExists.mockImplementation((_category: string, url: string) =>
      url.startsWith('/api/uploads/hotel/'),
    );
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
        { provide: getModelToken(City.name), useValue: cityModel },
        { provide: getModelToken(Country.name), useValue: countryModel },
        {
          provide: getModelToken(ModeratorAssignment.name),
          useValue: assignmentModel,
        },
        { provide: getModelToken(Review.name), useValue: reviewModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    service = moduleRef.get(HotelsService);
  });
 
  describe('create', () => {
    it('creates a hotel when city and country exist', async () => {
      cityModel.findById.mockReturnValue(referenceResult({ countryCode: 'EG' }));
      countryModel.findById.mockReturnValue(referenceResult({ code: 'EG' }));
      hotelModel.create.mockResolvedValue(makeHotelDoc());
 
      const result = await service.create(createDto);
 
      expect(hotelModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nile Palace', starRating: 5 }),
      );
      expect(result.name).toBe('Nile Palace');
      expect(result.checkInTime).toBe('14:00');
    });
 
    it('rejects an unknown city with a field-level error', async () => {
      cityModel.findById.mockReturnValue(referenceResult(null));
      countryModel.findById.mockReturnValue(referenceResult({ code: 'EG' }));
 
      await expect(service.create(createDto)).rejects.toMatchObject({
        response: { errors: { city: ['City does not exist'] } },
      });
      expect(hotelModel.create).not.toHaveBeenCalled();
    });
 
    it('rejects photos that are outside links', async () => {
      cityModel.findById.mockReturnValue(referenceResult({ countryCode: 'EG' }));
      countryModel.findById.mockReturnValue(referenceResult({ code: 'EG' }));
 
      const error = await service
        .create({ ...createDto, images: ['https://example.com/a.jpg'] })
        .catch((e: unknown) => e);
 
      expect(error).toBeInstanceOf(BadRequestException);
      expect(
        (error as BadRequestException).getResponse() as object,
      ).toMatchObject({ errors: { images: expect.any(Array) } });
      expect(hotelModel.create).not.toHaveBeenCalled();
    });
 
    it('accepts photos uploaded through the platform', async () => {
      cityModel.findById.mockReturnValue(referenceResult({ countryCode: 'EG' }));
      countryModel.findById.mockReturnValue(referenceResult({ code: 'EG' }));
      hotelModel.create.mockResolvedValue(makeHotelDoc());
 
      await service.create({
        ...createDto,
        images: ['/api/uploads/hotel/0b8e6f1c-3b52-4c8e-9a41-5f6a9c1d2e33.jpg'],
      });
 
      expect(hotelModel.create).toHaveBeenCalled();
    });
 
    it('rejects an unknown country', async () => {
      cityModel.findById.mockReturnValue(referenceResult({ countryCode: 'EG' }));
      countryModel.findById.mockReturnValue(referenceResult(null));
 
      await expect(service.create(createDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
 
  describe('update', () => {
    it('returns 404 for a malformed id', async () => {
      await expect(
        service.update('not-an-id', { name: 'X1' }, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { name: 'X1' },
          moderator,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult(null));
 
      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { name: 'New name' },
          moderator,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
 
    it('looks the assignment up by ObjectId, not by plain text', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      await service.update(
        new Types.ObjectId().toString(),
        { name: 'New name' },
        moderator,
      );
 
      const filter = assignmentModel.exists.mock.calls[0][0];
      expect(filter.moderatorId).toBeInstanceOf(Types.ObjectId);
      expect(filter.moderatorId.toString()).toBe(moderator.sub);
    });
 
    it('returns 403 when the user id is not a valid ObjectId', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
 
      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { name: 'New name' },
          { sub: 'not-an-id', role: UserRole.MODERATOR },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
 
    it('rejects photos that are outside links when updating', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { images: ['https://example.com/a.jpg'] },
          moderator,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
 
    it('rejects an empty update', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      await expect(
        service.update(new Types.ObjectId().toString(), {}, moderator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
 
    it('updates only the provided fields for the assigned moderator', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      const result = await service.update(
        new Types.ObjectId().toString(),
        { description: 'Renovated', amenities: undefined },
        moderator,
      );
 
      expect(doc.set).toHaveBeenCalledWith({ description: 'Renovated' });
      expect(doc.save).toHaveBeenCalled();
      expect(result.description).toBe('Renovated');
    });
 
    it('rejects an unknown city on update without saving', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      cityModel.findById.mockReturnValue(referenceResult(null));
 
      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { city: new Types.ObjectId().toString() },
          moderator,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(doc.save).not.toHaveBeenCalled();
    });
  });
 
  describe('updateCheckTimes', () => {
    const dto = { checkInTime: '15:00', checkOutTime: '11:00' };
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(
        service.updateCheckTimes(
          new Types.ObjectId().toString(),
          dto,
          moderator,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult(null));
 
      await expect(
        service.updateCheckTimes(
          new Types.ObjectId().toString(),
          dto,
          moderator,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(doc.save).not.toHaveBeenCalled();
    });
 
    it('saves both times for the assigned moderator', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      const result = await service.updateCheckTimes(
        new Types.ObjectId().toString(),
        dto,
        moderator,
      );
 
      expect(doc.checkInTime).toBe('15:00');
      expect(doc.checkOutTime).toBe('11:00');
      expect(doc.save).toHaveBeenCalled();
      expect(result.checkInTime).toBe('15:00');
      expect(result.checkOutTime).toBe('11:00');
    });
  });
 
  describe('updatePolicies', () => {
    const id = () => new Types.ObjectId().toString();
    const assigned = () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      return doc;
    };
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(
        service.updatePolicies(id(), { checkInTime: '15:00' }, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult(null));
      await expect(
        service.updatePolicies(id(), { checkInTime: '15:00' }, moderator),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(doc.save).not.toHaveBeenCalled();
    });
 
    it('rejects an empty body', async () => {
      const doc = assigned();
      await expect(
        service.updatePolicies(id(), {}, moderator),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(doc.save).not.toHaveBeenCalled();
    });
 
    it('rejects duplicate tier days and does not save', async () => {
      const doc = assigned();
      await expect(
        service.updatePolicies(
          id(),
          {
            cancellationTiers: [
              { daysBeforeCheckIn: 7, refundPercentage: 50 },
              { daysBeforeCheckIn: 7, refundPercentage: 10 },
            ],
          },
          moderator,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(doc.save).not.toHaveBeenCalled();
    });
 
    it('saves times and tiers together', async () => {
      const doc = assigned();
      const result = await service.updatePolicies(
        id(),
        {
          checkInTime: '15:00',
          checkOutTime: '11:00',
          cancellationTiers: [{ daysBeforeCheckIn: 3, refundPercentage: 25 }],
        },
        moderator,
      );
      expect(doc.save).toHaveBeenCalled();
      expect(result.checkInTime).toBe('15:00');
      expect(result.checkOutTime).toBe('11:00');
      expect(result.cancellationTiers).toEqual([
        { daysBeforeCheckIn: 3, refundPercentage: 25 },
      ]);
    });
 
    it('keeps the tiers when only a time is sent', async () => {
      const doc = assigned();
      doc.policies = {
        cancellationTiers: [{ daysBeforeCheckIn: 5, refundPercentage: 40 }],
      };
      const result = await service.updatePolicies(
        id(),
        { checkOutTime: '10:30' },
        moderator,
      );
      expect(result.checkOutTime).toBe('10:30');
      expect(result.cancellationTiers).toEqual([
        { daysBeforeCheckIn: 5, refundPercentage: 40 },
      ]);
    });
  });
 
  describe('setCancellationTiers', () => {
    const idOf = () => new Types.ObjectId().toString();
    const tiers = [
      { daysBeforeCheckIn: 14, refundPercentage: 100 },
      { daysBeforeCheckIn: 7, refundPercentage: 50 },
      { daysBeforeCheckIn: 0, refundPercentage: 0 },
    ];
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(
        service.setCancellationTiers(idOf(), { tiers }, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult(null));
 
      await expect(
        service.setCancellationTiers(idOf(), { tiers }, moderator),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(doc.save).not.toHaveBeenCalled();
    });
 
    it('saves valid tiers and returns them', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      const result = await service.setCancellationTiers(
        idOf(),
        { tiers },
        moderator,
      );
 
      expect(doc.save).toHaveBeenCalled();
      expect(result.id).toBe(String(doc._id));
      expect(result.cancellationTiers).toEqual(tiers);
    });
 
    it('accepts an empty list to remove all tiers', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      const result = await service.setCancellationTiers(
        idOf(),
        { tiers: [] },
        moderator,
      );
 
      expect(result.cancellationTiers).toEqual([]);
    });
 
    const expectRejected = async (badTiers: unknown[], message: string) => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      const error = await service
        .setCancellationTiers(idOf(), { tiers: badTiers as never }, moderator)
        .catch((e: unknown) => e);
 
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        errors: { tiers: string[] };
      };
      expect(body.errors.tiers.join(' | ')).toContain(message);
      expect(doc.save).not.toHaveBeenCalled();
    };
 
    it('rejects a duplicate days-before-check-in value', async () => {
      await expectRejected(
        [
          { daysBeforeCheckIn: 7, refundPercentage: 50 },
          { daysBeforeCheckIn: 7, refundPercentage: 20 },
        ],
        'Tier 2: days before check-in 7 is already used',
      );
    });
 
    it.each([-1, 1.5, '7', null])(
      'rejects %p as days before check-in',
      async (days) => {
        await expectRejected(
          [{ daysBeforeCheckIn: days, refundPercentage: 50 }],
          'days before check-in must be a whole number, 0 or more',
        );
      },
    );
 
    it.each([-1, 101, '50', null])(
      'rejects %p as a refund percentage',
      async (percent) => {
        await expectRejected(
          [{ daysBeforeCheckIn: 3, refundPercentage: percent }],
          'refund percentage must be between 0 and 100',
        );
      },
    );
 
    it('accepts the boundary values 0 and 100', async () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
 
      await expect(
        service.setCancellationTiers(
          idOf(),
          {
            tiers: [
              { daysBeforeCheckIn: 0, refundPercentage: 0 },
              { daysBeforeCheckIn: 30, refundPercentage: 100 },
            ],
          },
          moderator,
        ),
      ).resolves.toBeDefined();
    });
  });
 
  describe('createRoom', () => {
    const idOf = () => new Types.ObjectId().toString();
    const dto = {
      roomNumber: ' a101 ',
      type: 'Double',
      beds: 2,
      maxOccupancy: 3,
      pricePerNight: 1500.5,
    };
    const assignedHotel = () => {
      const doc = makeHotelDoc();
      hotelModel.findById.mockReturnValue(execResult(doc));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      return doc;
    };
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(
        service.createRoom(idOf(), dto, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult(null));
 
      await expect(
        service.createRoom(idOf(), dto, moderator),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(roomModel.create).not.toHaveBeenCalled();
    });
 
    it('creates the room with an upper-case room number', async () => {
      const hotel = assignedHotel();
      roomModel.exists.mockReturnValue(execResult(null));
      roomModel.create.mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          isActive: true,
          ...data,
        }),
      );
 
      const result = await service.createRoom(idOf(), dto, moderator);
 
      expect(roomModel.exists.mock.calls[0][0]).toEqual({
        hotel: hotel._id,
        roomNumber: 'A101',
      });
      expect(roomModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ hotel: hotel._id, roomNumber: 'A101' }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          hotelId: String(hotel._id),
          roomNumber: 'A101',
          type: 'Double',
          beds: 2,
          maxOccupancy: 3,
          pricePerNight: 1500.5,
          isActive: true,
        }),
      );
    });
 
    it('returns 409 when the room number already exists in the hotel', async () => {
      assignedHotel();
      roomModel.exists.mockReturnValue(execResult({ _id: 'r' }));
 
      await expect(
        service.createRoom(idOf(), dto, moderator),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(roomModel.create).not.toHaveBeenCalled();
    });
 
    it('returns 409 when the database unique index rejects a race', async () => {
      assignedHotel();
      roomModel.exists.mockReturnValue(execResult(null));
      roomModel.create.mockRejectedValue({ code: 11000 });
 
      await expect(
        service.createRoom(idOf(), dto, moderator),
      ).rejects.toBeInstanceOf(ConflictException);
    });
 
    it('does not hide other database errors', async () => {
      assignedHotel();
      roomModel.exists.mockReturnValue(execResult(null));
      roomModel.create.mockRejectedValue(new Error('db down'));
 
      await expect(service.createRoom(idOf(), dto, moderator)).rejects.toThrow(
        'db down',
      );
    });
  });
 
  describe('addRoomBookableRange', () => {
    const idOf = () => new Types.ObjectId().toString();
    const dto = { startDate: '2026-12-01', endDate: '2026-12-31' };
    const setup = () => {
      const hotel = makeHotelDoc();
      const room = { _id: new Types.ObjectId() };
      hotelModel.findById.mockReturnValue(execResult(hotel));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      roomModel.findOne.mockReturnValue(execResult(room));
      availabilityModel.findOne.mockReturnValue(execResult(null));
      availabilityModel.create.mockImplementation(
        (data: Record<string, unknown>) =>
          Promise.resolve({ _id: new Types.ObjectId(), ...data }),
      );
      return { hotel, room };
    };
    const call = (body = dto) =>
      service.addRoomBookableRange(idOf(), idOf(), body, moderator);
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult(null));
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
      expect(availabilityModel.create).not.toHaveBeenCalled();
    });
 
    it('returns 404 when the room is not in this hotel', async () => {
      setup();
      roomModel.findOne.mockReturnValue(execResult(null));
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 404 for a malformed room id', async () => {
      setup();
      await expect(
        service.addRoomBookableRange(idOf(), 'not-an-id', dto, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('creates the range and returns plain dates', async () => {
      const { hotel, room } = setup();
 
      const result = await call();
 
      expect(roomModel.findOne.mock.calls[0][0]).toEqual({
        _id: expect.any(String),
        hotel: hotel._id,
      });
      expect(availabilityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          room: room._id,
          hotel: hotel._id,
          type: 'available',
          startDate: new Date('2026-12-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          roomId: String(room._id),
          hotelId: String(hotel._id),
          type: 'available',
          startDate: '2026-12-01',
          endDate: '2026-12-31',
        }),
      );
    });
 
    it('accepts a one-day range', async () => {
      setup();
      await expect(
        call({ startDate: '2026-12-01', endDate: '2026-12-01' }),
      ).resolves.toBeDefined();
    });
 
    it('checks overlap with both days included, for available ranges of this room only', async () => {
      const { room } = setup();
      await call();
      expect(availabilityModel.findOne).toHaveBeenCalledWith({
        room: room._id,
        type: 'available',
        startDate: { $lte: new Date('2026-12-31T00:00:00.000Z') },
        endDate: { $gte: new Date('2026-12-01T00:00:00.000Z') },
      });
    });
 
    it('returns 409 and does not save when the range overlaps', async () => {
      setup();
      availabilityModel.findOne.mockReturnValue(
        execResult({
          startDate: new Date('2026-12-20T00:00:00.000Z'),
          endDate: new Date('2027-01-05T00:00:00.000Z'),
        }),
      );
 
      const error = await call().catch((e: unknown) => e);
 
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain(
        '2026-12-20 to 2027-01-05',
      );
      expect(availabilityModel.create).not.toHaveBeenCalled();
    });
 
    const expectBadRequest = async (
      body: { startDate: string; endDate: string },
      field: string,
    ) => {
      setup();
      const error = await call(body).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        errors: Record<string, string[]>;
      };
      expect(Object.keys(response.errors)).toContain(field);
      expect(availabilityModel.create).not.toHaveBeenCalled();
    };
 
    it('rejects an end date before the start date', async () => {
      await expectBadRequest(
        { startDate: '2026-12-31', endDate: '2026-12-01' },
        'endDate',
      );
    });
 
    it.each(['2026-02-30', '2026-13-01', '2026-00-10'])(
      'rejects %s because it is not a real day',
      async (value) => {
        await expectBadRequest(
          { startDate: value, endDate: '2027-01-01' },
          'startDate',
        );
      },
    );
  });
 
  // ---------- HTL-05 (from feature/HTL-05) ----------
 
  describe('updateRoom', () => {
    const idOf = () => new Types.ObjectId().toString();
    const setup = () => {
      const room = {
        _id: new Types.ObjectId(),
        hotel: new Types.ObjectId(),
        roomNumber: 'A101',
        type: 'Double',
        beds: 2,
        maxOccupancy: 3,
        pricePerNight: 1500,
        isActive: true,
        save: jest.fn().mockResolvedValue(undefined),
      };
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      roomModel.findOne.mockReturnValue(execResult(room));
      return room;
    };
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(
        service.updateRoom(idOf(), idOf(), { beds: 3 }, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult(null));
      await expect(
        service.updateRoom(idOf(), idOf(), { beds: 3 }, moderator),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
 
    it('returns 404 when the room is not in this hotel', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      roomModel.findOne.mockReturnValue(execResult(null));
      await expect(
        service.updateRoom(idOf(), idOf(), { beds: 3 }, moderator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('rejects an empty update', async () => {
      const room = setup();
      await expect(
        service.updateRoom(idOf(), idOf(), {}, moderator),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(room.save).not.toHaveBeenCalled();
    });
 
    it('changes only the fields that were sent', async () => {
      const room = setup();
      const result = await service.updateRoom(
        idOf(),
        idOf(),
        { pricePerNight: 1750 },
        moderator,
      );
      expect(room.save).toHaveBeenCalled();
      expect(result.pricePerNight).toBe(1750);
      expect(result.beds).toBe(2);
      expect(result.maxOccupancy).toBe(3);
    });
 
    it('updates beds and occupancy together', async () => {
      setup();
      const result = await service.updateRoom(
        idOf(),
        idOf(),
        { beds: 4, maxOccupancy: 6 },
        moderator,
      );
      expect(result.beds).toBe(4);
      expect(result.maxOccupancy).toBe(6);
    });
  });
 
  describe('updateRoomBookableRange', () => {
    const idOf = () => new Types.ObjectId().toString();
    const range = () => ({
      _id: new Types.ObjectId(),
      room: new Types.ObjectId(),
      hotel: new Types.ObjectId(),
      type: 'available',
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined),
    });
    const setup = (found: ReturnType<typeof range> | null = range()) => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      roomModel.findOne.mockReturnValue(
        execResult({ _id: new Types.ObjectId() }),
      );
      // first lookup: the range itself; second lookup: an overlapping range
      availabilityModel.findOne
        .mockReturnValueOnce(execResult(found))
        .mockReturnValueOnce(execResult(null));
      bookingModel.exists.mockReturnValue(execResult(null));
      return found;
    };
    const call = (dto: object) =>
      service.updateRoomBookableRange(
        idOf(),
        idOf(),
        { rangeId: idOf(), ...dto },
        moderator,
      );
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(call({ endDate: '2026-12-20' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
 
    it('returns 403 when the moderator is not assigned', async () => {
      setup();
      assignmentModel.exists.mockReturnValue(execResult(null));
      await expect(call({ endDate: '2026-12-20' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
 
    it('returns 400 when no date is sent', async () => {
      setup();
      await expect(call({})).rejects.toBeInstanceOf(BadRequestException);
    });
 
    it('returns 404 when the range does not exist', async () => {
      setup(null);
      await expect(call({ endDate: '2026-12-20' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
 
    it('returns 400 when the end is before the start', async () => {
      const found = setup()!;
      await expect(call({ endDate: '2026-11-20' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(found.save).not.toHaveBeenCalled();
    });
 
    it('returns 409 when the new dates overlap another range', async () => {
      const found = setup()!;
      availabilityModel.findOne.mockReset();
      availabilityModel.findOne
        .mockReturnValueOnce(execResult(found))
        .mockReturnValueOnce(execResult(range()));
      await expect(call({ endDate: '2027-01-20' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(found.save).not.toHaveBeenCalled();
    });
 
    it('returns 409 when an active (confirmed or pending payment) reservation is in the removed days', async () => {
      const found = setup()!;
      bookingModel.exists.mockReturnValue(execResult({ _id: 'b' }));
      await expect(call({ endDate: '2026-12-20' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(found.save).not.toHaveBeenCalled();
    });
 
    it('saves a shorter range and checks only the removed days', async () => {
      const found = setup()!;
      const result = await call({ endDate: '2026-12-20' });
      expect(found.save).toHaveBeenCalled();
      expect(result.endDate).toBe('2026-12-20');
      expect(bookingModel.exists).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
          $or: [
            {
              checkIn: { $lt: new Date('2027-01-01T00:00:00.000Z') },
              checkOut: { $gt: new Date('2026-12-21T00:00:00.000Z') },
            },
          ],
        }),
      );
    });
 
    it('does not check bookings when the range only grows', async () => {
      const found = setup()!;
      await call({ startDate: '2026-11-25', endDate: '2027-01-10' });
      expect(bookingModel.exists).not.toHaveBeenCalled();
      expect(found.save).toHaveBeenCalled();
    });
  });
 
  describe('removeRoomBookableRange', () => {
    const idOf = () => new Types.ObjectId().toString();
    const range = () => ({
      _id: new Types.ObjectId(),
      room: new Types.ObjectId(),
      hotel: new Types.ObjectId(),
      type: 'available',
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    });
    const setup = (found: ReturnType<typeof range> | null = range()) => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      roomModel.findOne.mockReturnValue(
        execResult({ _id: new Types.ObjectId() }),
      );
      availabilityModel.findOne.mockReturnValue(execResult(found));
      bookingModel.exists.mockReturnValue(execResult(null));
      return found;
    };
    const call = (rangeId = idOf()) =>
      service.removeRoomBookableRange(idOf(), idOf(), rangeId, moderator);
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 403 when the moderator is not assigned to the hotel', async () => {
      setup();
      assignmentModel.exists.mockReturnValue(execResult(null));
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    });
 
    it('returns 404 for an invalid range id', async () => {
      setup();
      await expect(call('not-an-id')).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 404 when the range does not exist for this room', async () => {
      setup(null);
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    });
 
    it('returns 409 and keeps the range when an active reservation is inside it', async () => {
      const found = setup()!;
      bookingModel.exists.mockReturnValue(execResult({ _id: 'b' }));
      await expect(call()).rejects.toBeInstanceOf(ConflictException);
      expect(found.deleteOne).not.toHaveBeenCalled();
    });
 
    it('checks Confirmed and Pending Payment reservations that overlap the range', async () => {
      setup();
      await call();
      expect(bookingModel.exists).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
          checkIn: { $lt: new Date('2027-01-01T00:00:00.000Z') },
          checkOut: { $gt: new Date('2026-12-01T00:00:00.000Z') },
        }),
      );
    });
 
    it('removes the range when there is no active reservation', async () => {
      const found = setup()!;
      const result = await call();
      expect(found.deleteOne).toHaveBeenCalled();
      expect(result.startDate).toBe('2026-12-01');
      expect(result.endDate).toBe('2026-12-31');
    });
  });
 
  describe('getDetails', () => {
    // Fix "today" (only Date is faked) so the hard-coded stay dates stay in the future.
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date('2026-11-15T10:00:00.000Z'),
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
    });
    afterEach(() => {
      jest.useRealTimers();
    });
    const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
    const hotelWithPolicy = () => {
      const doc = makeHotelDoc();
      doc.amenities = ['wifi'];
      doc.images = ['https://example.com/1.jpg'];
      doc.policies = {
        cancellationTiers: [{ daysBeforeCheckIn: 7, refundPercentage: 100 }],
      };
      doc.averageRating = 4.5;
      doc.reviewCount = 2;
      hotelModel.findById.mockReturnValue(execResult(doc));
      return doc;
    };
    const room = (roomNumber: string) => ({
      _id: new Types.ObjectId(),
      roomNumber,
      type: 'Double',
      beds: 2,
      maxOccupancy: 3,
      pricePerNight: 1500,
    });
    const rangeOf = (
      roomDoc: { _id: Types.ObjectId },
      start: string,
      end: string,
      type = 'available',
    ) => ({
      room: roomDoc._id,
      type,
      startDate: day(start),
      endDate: day(end),
    });
    const withRooms = (
      rooms: ReturnType<typeof room>[],
      ranges: unknown[] = [],
      bookings: unknown[] = [],
    ) => {
      roomModel.find.mockReturnValue(chain(rooms));
      availabilityModel.find.mockReturnValue(chain(ranges));
      bookingModel.find.mockReturnValue(chain(bookings));
    };
    const stay = { checkIn: '2026-12-10', checkOut: '2026-12-13' };
    const idOf = () => new Types.ObjectId().toString();
 
    beforeEach(() => {
      reviewModel.find.mockReturnValue(chain([]));
      cityModel.findById.mockReturnValue(chain({ name: 'Cairo' }));
      countryModel.findById.mockReturnValue(chain({ name: 'Egypt' }));
    });
 
    it('returns the city and country names alongside their ids', async () => {
      const doc = hotelWithPolicy();
      const result = await service.getDetails(idOf(), {});
      expect(result.city).toBe(String(doc.city));
      expect(result.cityName).toBe('Cairo');
      expect(result.country).toBe(String(doc.country));
      expect(result.countryName).toBe('Egypt');
    });
 
    it('falls back to empty names when the city or country row is missing', async () => {
      hotelWithPolicy();
      cityModel.findById.mockReturnValue(chain(null));
      countryModel.findById.mockReturnValue(chain(null));
      const result = await service.getDetails(idOf(), {});
      expect(result.cityName).toBe('');
      expect(result.countryName).toBe('');
    });
 
    it('returns 404 for a malformed id', async () => {
      await expect(service.getDetails('nope', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
 
    it('returns 404 when the hotel does not exist', async () => {
      hotelModel.findById.mockReturnValue(execResult(null));
      await expect(service.getDetails(idOf(), {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
 
    it('returns 404 for an inactive hotel', async () => {
      const doc = makeHotelDoc();
      doc.isActive = false;
      hotelModel.findById.mockReturnValue(execResult(doc));
      await expect(service.getDetails(idOf(), {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
 
    it('returns the profile, policy and rating without rooms when no dates are sent', async () => {
      hotelWithPolicy();
      const result = await service.getDetails(idOf(), {});
      expect(result.name).toBe('Nile Palace');
      expect(result.amenities).toEqual(['wifi']);
      expect(result.images).toHaveLength(1);
      expect(result.checkInTime).toBe('14:00');
      expect(result.cancellationTiers).toEqual([
        { daysBeforeCheckIn: 7, refundPercentage: 100 },
      ]);
      expect(result.averageRating).toBe(4.5);
      expect(result.availableRooms).toBeUndefined();
      expect(roomModel.find).not.toHaveBeenCalled();
    });
 
    it('returns an empty cancellation policy when none is set', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));
      const result = await service.getDetails(idOf(), {});
      expect(result.cancellationTiers).toEqual([]);
    });
 
    it('shows reviews with the reviewer first name and last initial', async () => {
      hotelWithPolicy();
      const userId = new Types.ObjectId();
      reviewModel.find.mockReturnValue(
        chain([
          {
            _id: new Types.ObjectId(),
            user: userId,
            rating: 4,
            comment: 'Nice',
            createdAt: day('2026-11-01'),
          },
        ]),
      );
      userModel.find.mockReturnValue(
        chain([{ _id: userId, firstName: 'Sara', lastName: 'Mohamed' }]),
      );
      const result = await service.getDetails(idOf(), {});
      expect(reviewModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ hidden: false }),
      );
      expect(result.reviews).toEqual([
        expect.objectContaining({
          reviewer: 'Sara M.',
          rating: 4,
          comment: 'Nice',
        }),
      ]);
    });
 
    it('shows the moderator reply on each review of the details page, or null', async () => {
      hotelWithPolicy();
      const userId = new Types.ObjectId();
      const repliedAt = day('2026-11-02');
      reviewModel.find.mockReturnValue(
        chain([
          {
            _id: new Types.ObjectId(),
            user: userId,
            rating: 4,
            comment: 'Nice',
            createdAt: day('2026-11-01'),
            reply: { text: 'Thank you!', moderator: new Types.ObjectId(), repliedAt },
          },
          { _id: new Types.ObjectId(), user: userId, rating: 3, createdAt: day('2026-10-30') },
        ]),
      );
      userModel.find.mockReturnValue(chain([{ _id: userId, firstName: 'Sara', lastName: 'Mohamed' }]));
      const result = await service.getDetails(idOf(), {});
      expect(result.reviews[0].reply).toEqual({ text: 'Thank you!', repliedAt: repliedAt.toISOString() });
      expect(result.reviews[1].reply).toBeNull();
    });

    it.each([
      [{ checkIn: '2026-12-10' }, 'checkOut'],
      [{ checkOut: '2026-12-13' }, 'checkIn'],
      [{ checkIn: '2026-12-13', checkOut: '2026-12-10' }, 'checkOut'],
      [{ checkIn: '2026-12-10', checkOut: '2026-12-10' }, 'checkOut'],
      [{ checkIn: '2026-02-30', checkOut: '2026-03-02' }, 'checkIn'],
      [{ checkIn: 'tomorrow', checkOut: '2026-03-02' }, 'checkIn'],
    ])('rejects bad stay dates %j', async (query, field) => {
      hotelWithPolicy();
      const error = await service
        .getDetails(idOf(), query)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        errors: Record<string, string[]>;
      };
      expect(Object.keys(response.errors)).toContain(field);
    });
 
    it.each([
      [{ checkIn: '2026-11-14', checkOut: '2026-11-16' }],
      [{ checkIn: '2020-01-10', checkOut: '2020-01-14' }],
    ])('rejects a check-in in the past %j with a 400', async (query) => {
      hotelWithPolicy();
      const error = await service
        .getDetails(idOf(), query)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(
        (
          (error as BadRequestException).getResponse() as {
            errors: Record<string, string[]>;
          }
        ).errors.checkIn,
      ).toEqual(['Check-in cannot be in the past']);
      expect(roomModel.find).not.toHaveBeenCalled();
    });
 
    it('accepts a check-in today', async () => {
      hotelWithPolicy();
      withRooms([]);
      await expect(
        service.getDetails(idOf(), {
          checkIn: '2026-11-15',
          checkOut: '2026-11-16',
        }),
      ).resolves.toBeDefined();
    });
 
    it('lists a room whose bookable range covers the stay', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms([a], [rangeOf(a, '2026-12-01', '2026-12-31')]);
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toEqual([
        expect.objectContaining({
          roomNumber: 'A101',
          pricePerNight: 1500,
          currency: 'USD',
        }),
      ]);
    });
 
    it('lists a room when two touching ranges together cover the stay', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms(
        [a],
        [
          rangeOf(a, '2026-12-01', '2026-12-11'),
          rangeOf(a, '2026-12-12', '2026-12-31'),
        ],
      );
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toHaveLength(1);
    });
 
    it('does not list a room that has no bookable range for the stay', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms([a], []);
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toEqual([]);
    });
 
    it('does not list a room whose range ends before the last night', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms([a], [rangeOf(a, '2026-12-01', '2026-12-11')]);
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toEqual([]);
    });
 
    it('lists a room when the check-out day is just after the range end', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms([a], [rangeOf(a, '2026-12-01', '2026-12-12')]);
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toHaveLength(1);
    });
 
    it('does not list a room blocked during the stay', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms(
        [a],
        [
          rangeOf(a, '2026-12-01', '2026-12-31'),
          rangeOf(a, '2026-12-11', '2026-12-11', 'blocked'),
        ],
      );
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toEqual([]);
    });
 
    it('does not list a room that has an overlapping booking', async () => {
      hotelWithPolicy();
      const a = room('A101');
      const b = room('A102');
      withRooms(
        [a, b],
        [
          rangeOf(a, '2026-12-01', '2026-12-31'),
          rangeOf(b, '2026-12-01', '2026-12-31'),
        ],
        [{ rooms: [{ room: a._id }] }],
      );
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms?.map((r) => r.roomNumber)).toEqual(['A102']);
    });
 
    it('asks only for confirmed bookings and live holds that overlap', async () => {
      hotelWithPolicy();
      const a = room('A101');
      withRooms([a], [rangeOf(a, '2026-12-01', '2026-12-31')]);
      await service.getDetails(idOf(), stay);
      expect(bookingModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          checkIn: { $lt: day('2026-12-13') },
          checkOut: { $gt: day('2026-12-10') },
          $or: [
            { status: 'CONFIRMED' },
            {
              status: 'PENDING_PAYMENT',
              holdExpiresAt: { $gt: expect.any(Date) },
            },
          ],
        }),
      );
    });
 
    it('returns an empty list when the hotel has no active rooms', async () => {
      hotelWithPolicy();
      roomModel.find.mockReturnValue(chain([]));
      const result = await service.getDetails(idOf(), stay);
      expect(result.availableRooms).toEqual([]);
    });
  });
 
  // ---------- HTL-06 (from develop) ----------
 
  describe('HTL-06 room blocking, deactivation and deletion', () => {
    const idOf = () => new Types.ObjectId().toString();
    const setup = (roomOverrides: Record<string, unknown> = {}) => {
      const hotel = makeHotelDoc();
      const room: Record<string, unknown> = {
        _id: new Types.ObjectId(),
        hotel: hotel._id,
        roomNumber: 'A101',
        type: 'Double',
        beds: 2,
        maxOccupancy: 3,
        pricePerNight: 100,
        currency: 'USD',
        isActive: true,
        ...roomOverrides,
      };
      room.save = jest.fn().mockResolvedValue(room);
      hotelModel.findById.mockReturnValue(execResult(hotel));
      assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
      roomModel.findOne.mockReturnValue(execResult(room));
      bookingModel.exists.mockReturnValue(execResult(null));
      availabilityModel.findOne.mockReturnValue(execResult(null));
      availabilityModel.create.mockImplementation(
        (data: Record<string, unknown>) =>
          Promise.resolve({ _id: new Types.ObjectId(), ...data }),
      );
      availabilityModel.deleteMany.mockReturnValue(execResult({}));
      roomModel.deleteOne.mockReturnValue(execResult({}));
      return { hotel, room };
    };
 
    const sharedGuards = (call: () => Promise<unknown>) => {
      it('returns 404 when the hotel does not exist', async () => {
        setup();
        hotelModel.findById.mockReturnValue(execResult(null));
        await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      });
 
      it('returns 403 when the moderator is not assigned to the hotel', async () => {
        setup();
        assignmentModel.exists.mockReturnValue(execResult(null));
        await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
        expect(bookingModel.exists).not.toHaveBeenCalled();
      });
 
      it('returns 404 when the room is not in this hotel', async () => {
        setup();
        roomModel.findOne.mockReturnValue(execResult(null));
        await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      });
    };
 
    describe('blockRoomDates', () => {
      const dto = {
        startDate: '2026-12-10',
        endDate: '2026-12-15',
        reason: 'Maintenance',
      };
      const call = (body: { startDate: string; endDate: string; reason?: string } = dto) =>
        service.blockRoomDates(idOf(), idOf(), body, moderator);
 
      sharedGuards(() => call());
 
      it('returns 404 for a malformed room id', async () => {
        setup();
        await expect(
          service.blockRoomDates(idOf(), 'not-an-id', dto, moderator),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
 
      it('creates a blocked range and returns plain dates', async () => {
        const { hotel, room } = setup();
 
        const result = await call();
 
        expect(availabilityModel.create).toHaveBeenCalledWith({
          room: room._id,
          hotel: hotel._id,
          type: 'blocked',
          startDate: new Date('2026-12-10T00:00:00.000Z'),
          endDate: new Date('2026-12-15T00:00:00.000Z'),
          reason: 'Maintenance',
        });
        expect(result).toEqual(
          expect.objectContaining({
            roomId: String(room._id),
            hotelId: String(hotel._id),
            type: 'blocked',
            startDate: '2026-12-10',
            endDate: '2026-12-15',
          }),
        );
      });
 
      it('saves an empty reason when none is given', async () => {
        setup();
        await call({ startDate: '2026-12-10', endDate: '2026-12-10' });
        expect(availabilityModel.create).toHaveBeenCalledWith(
          expect.objectContaining({ reason: '' }),
        );
      });
 
      it('looks for Confirmed or Pending Payment stays that overlap the blocked days', async () => {
        const { room } = setup();
        await call();
        expect(bookingModel.exists).toHaveBeenCalledWith({
          'rooms.room': room._id,
          status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
          checkIn: { $lte: new Date('2026-12-15T00:00:00.000Z') },
          checkOut: { $gt: new Date('2026-12-10T00:00:00.000Z') },
        });
      });
 
      it('returns 409 and does not save when a reservation overlaps', async () => {
        setup();
        bookingModel.exists.mockReturnValue(execResult({ _id: 'booking' }));
 
        const error = await call().catch((e: unknown) => e);
 
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toContain('reservation');
        expect(availabilityModel.create).not.toHaveBeenCalled();
      });
 
      it('rejects an end date before the start date', async () => {
        setup();
        const error = await call({
          startDate: '2026-12-15',
          endDate: '2026-12-10',
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(
          (
            (error as BadRequestException).getResponse() as {
              errors: Record<string, string[]>;
            }
          ).errors,
        ).toHaveProperty('endDate');
        expect(bookingModel.exists).not.toHaveBeenCalled();
        expect(availabilityModel.create).not.toHaveBeenCalled();
      });
 
      it('rejects a date that is not a real day', async () => {
        setup();
        const error = await call({
          startDate: '2026-02-30',
          endDate: '2026-03-02',
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(availabilityModel.create).not.toHaveBeenCalled();
      });
    });
 
    describe('deactivateRoom', () => {
      const call = () => service.deactivateRoom(idOf(), idOf(), moderator);
 
      sharedGuards(call);
 
      it('deactivates the room when nothing is reserved', async () => {
        const { room } = setup();
 
        const result = await call();
 
        expect(room.isActive).toBe(false);
        expect(room.save).toHaveBeenCalled();
        expect(result).toEqual(
          expect.objectContaining({ id: String(room._id), isActive: false }),
        );
      });
 
      it('looks for Confirmed or Pending Payment stays that have not ended yet', async () => {
        const { room } = setup();
        await call();
        const filter = bookingModel.exists.mock.calls[0][0] as {
          'rooms.room': unknown;
          status: unknown;
          checkOut: { $gt: Date };
        };
        expect(filter['rooms.room']).toBe(room._id);
        expect(filter.status).toEqual({ $in: ['CONFIRMED', 'PENDING_PAYMENT'] });
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        expect(filter.checkOut.$gt.getTime()).toBe(today.getTime());
      });
 
      it('returns 409 and keeps the room active when a reservation has not ended', async () => {
        const { room } = setup();
        bookingModel.exists.mockReturnValue(execResult({ _id: 'booking' }));
 
        await expect(call()).rejects.toBeInstanceOf(ConflictException);
 
        expect(room.isActive).toBe(true);
        expect(room.save).not.toHaveBeenCalled();
      });
 
      it('returns the room unchanged when it is already inactive', async () => {
        const { room } = setup({ isActive: false });
 
        const result = await call();
 
        expect(result.isActive).toBe(false);
        expect(bookingModel.exists).not.toHaveBeenCalled();
        expect(room.save).not.toHaveBeenCalled();
      });
    });
 
    describe('deleteRoom', () => {
      const call = () => service.deleteRoom(idOf(), idOf(), moderator);
 
      sharedGuards(call);
 
      it('returns 404 for a malformed room id', async () => {
        setup();
        await expect(
          service.deleteRoom(idOf(), 'not-an-id', moderator),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
 
      it('deletes a room that was never reserved, with its availability ranges', async () => {
        const { room } = setup();
 
        await expect(call()).resolves.toBeUndefined();
 
        expect(bookingModel.exists).toHaveBeenCalledWith({
          'rooms.room': room._id,
        });
        expect(availabilityModel.deleteMany).toHaveBeenCalledWith({
          room: room._id,
        });
        expect(roomModel.deleteOne).toHaveBeenCalledWith({ _id: room._id });
      });
 
      it('returns 409 and deletes nothing when the room has been reserved before', async () => {
        setup();
        bookingModel.exists.mockReturnValue(execResult({ _id: 'booking' }));
 
        await expect(call()).rejects.toBeInstanceOf(ConflictException);
 
        expect(availabilityModel.deleteMany).not.toHaveBeenCalled();
        expect(roomModel.deleteOne).not.toHaveBeenCalled();
      });
    });
  });
});
 