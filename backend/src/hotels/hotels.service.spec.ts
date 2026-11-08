import {
  BadRequestException,
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
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';

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
  const cityModel = { exists: jest.fn() };
  const countryModel = { exists: jest.fn() };
  const assignmentModel = { exists: jest.fn() };

  const moderator = {
    id: new Types.ObjectId().toString(),
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
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(City.name), useValue: cityModel },
        { provide: getModelToken(Country.name), useValue: countryModel },
        {
          provide: getModelToken(ModeratorAssignment.name),
          useValue: assignmentModel,
        },
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
      expect(filter.moderatorId.toString()).toBe(moderator.id);
    });

    it('returns 403 when the user id is not a valid ObjectId', async () => {
      hotelModel.findById.mockReturnValue(execResult(makeHotelDoc()));

      await expect(
        service.update(
          new Types.ObjectId().toString(),
          { name: 'New name' },
          { id: 'not-an-id', role: UserRole.MODERATOR },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
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
});
