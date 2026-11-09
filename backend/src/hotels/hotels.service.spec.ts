import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { UserRole } from '../users/schemas/user.schema';
import { UploadsService } from '../uploads/uploads.service';
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';
import { Room } from './schemas/room.schema';
import { RoomAvailability } from './schemas/room-availability.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });

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
    exists: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  };
  const availabilityModel = { findOne: jest.fn(), create: jest.fn() };
  const cityModel = { exists: jest.fn() };
  const countryModel = { exists: jest.fn() };
  const assignmentModel = { exists: jest.fn() };
  // GEN-08: only /api/uploads/hotel/<uuid>.jpg|png links count as uploaded photos
  const uploads = { isStoredUrl: jest.fn() };

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
    uploads.isStoredUrl.mockImplementation((_category: string, url: string) =>
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
        { provide: getModelToken(City.name), useValue: cityModel },
        { provide: getModelToken(Country.name), useValue: countryModel },
        {
          provide: getModelToken(ModeratorAssignment.name),
          useValue: assignmentModel,
        },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    service = moduleRef.get(HotelsService);
  });

  describe('create', () => {
    it('creates a hotel when city and country exist', async () => {
      cityModel.exists.mockResolvedValue({ _id: 'c' });
      countryModel.exists.mockResolvedValue({ _id: 'k' });
      hotelModel.create.mockResolvedValue(makeHotelDoc());

      const result = await service.create(createDto);

      expect(hotelModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nile Palace', starRating: 5 }),
      );
      expect(result.name).toBe('Nile Palace');
      expect(result.checkInTime).toBe('14:00');
    });

    it('rejects an unknown city with a field-level error', async () => {
      cityModel.exists.mockResolvedValue(null);
      countryModel.exists.mockResolvedValue({ _id: 'k' });

      await expect(service.create(createDto)).rejects.toMatchObject({
        response: { errors: { city: ['City does not exist'] } },
      });
      expect(hotelModel.create).not.toHaveBeenCalled();
    });

    it('rejects photos that are outside links', async () => {
      cityModel.exists.mockResolvedValue({ _id: 'c' });
      countryModel.exists.mockResolvedValue({ _id: 'k' });

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
      cityModel.exists.mockResolvedValue({ _id: 'c' });
      countryModel.exists.mockResolvedValue({ _id: 'k' });
      hotelModel.create.mockResolvedValue(makeHotelDoc());

      await service.create({
        ...createDto,
        images: ['/api/uploads/hotel/0b8e6f1c-3b52-4c8e-9a41-5f6a9c1d2e33.jpg'],
      });

      expect(hotelModel.create).toHaveBeenCalled();
    });

    it('rejects an unknown country', async () => {
      cityModel.exists.mockResolvedValue({ _id: 'c' });
      countryModel.exists.mockResolvedValue(null);

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
      cityModel.exists.mockResolvedValue(null);

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
});
