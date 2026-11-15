import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { PLATFORM_CURRENCY } from '../common/constants/currency.constants';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { User } from '../users/schemas/user.schema';
import {
  ModeratorAssignment,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import {
  HotelBooking,
  HotelBookingStatus,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto';
import {
  AvailableRoomDto,
  HotelDetailsResponseDto,
  HotelReviewDto,
} from './dto/hotel-details-response.dto';
import { HotelResponseDto } from './dto/hotel-response.dto';
import { RoomAvailabilityResponseDto } from './dto/room-availability-response.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import {
  CancellationTiersResponseDto,
  UpdateCancellationTiersDto,
} from './dto/update-cancellation-tiers.dto';
import { UpdateCheckTimesDto } from './dto/update-check-times.dto';
import {
  PoliciesResponseDto,
  UpdatePoliciesDto,
} from './dto/update-policies.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { UploadsService } from '../uploads/uploads.service';
import { ImageCategory } from '../uploads/uploads.constants';
import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { Room, RoomDocument } from './schemas/room.schema';
import {
  AvailabilityType,
  RoomAvailability,
  RoomAvailabilityDocument,
} from './schemas/room-availability.schema';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailability>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignment>,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly uploads: UploadsService,
  ) {}

  /** HTL-01: an admin creates a hotel profile. */
  async create(dto: CreateHotelDto): Promise<HotelResponseDto> {
    await this.assertCityAndCountryExist(dto.city, dto.country);
    this.assertImagesAreUploads(dto.images);

    const hotel = await this.hotelModel.create({
      name: dto.name,
      description: dto.description,
      address: dto.address,
      city: dto.city,
      country: dto.country,
      starRating: dto.starRating,
      amenities: dto.amenities,
      images: dto.images,
    });

    return this.toResponse(hotel);
  }

  /** HTL-01: the assigned hotel moderator edits their own hotel's profile. */
  async update(
    id: string,
    dto: UpdateHotelDto,
    user: AuthPayload,
  ): Promise<HotelResponseDto> {
    const hotel = await this.findHotelOrFail(id);
    await this.assertModeratorOwnsHotel(user, hotel);

    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { body: ['Provide at least one field to update'] },
      });
    }

    await this.assertCityAndCountryExist(dto.city, dto.country);
    this.assertImagesAreUploads(dto.images);

    hotel.set(changes);
    await hotel.save();

    return this.toResponse(hotel);
  }

  /** HTL-09: the assigned moderator sets the standard check-in/check-out times. */
  async updateCheckTimes(
    id: string,
    dto: UpdateCheckTimesDto,
    user: AuthPayload,
  ): Promise<HotelResponseDto> {
    const hotel = await this.findHotelOrFail(id);
    await this.assertModeratorOwnsHotel(user, hotel);

    hotel.checkInTime = dto.checkInTime;
    hotel.checkOutTime = dto.checkOutTime;
    await hotel.save();

    return this.toResponse(hotel);
  }

  /** HTL-10: the assigned moderator replaces the hotel's cancellation tiers. */
  async setCancellationTiers(
    id: string,
    dto: UpdateCancellationTiersDto,
    user: AuthPayload,
  ): Promise<CancellationTiersResponseDto> {
    const hotel = await this.findHotelOrFail(id);
    await this.assertModeratorOwnsHotel(user, hotel);

    const problems = this.findTierProblems(dto.tiers);
    if (problems.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { tiers: problems },
      });
    }

    hotel.policies = {
      cancellationTiers: dto.tiers.map((tier) => ({
        daysBeforeCheckIn: tier.daysBeforeCheckIn,
        refundPercentage: tier.refundPercentage,
      })),
    };
    await hotel.save();

    return {
      id: hotel._id.toString(),
      cancellationTiers: hotel.policies.cancellationTiers.map((tier) => ({
        daysBeforeCheckIn: tier.daysBeforeCheckIn,
        refundPercentage: tier.refundPercentage,
      })),
    };
  }

  /**
   * HTL-09 + HTL-10 (contract: PUT /hotels/:id/policies): check-in/out times and
   * cancellation tiers in one request. Fields that are not sent are left unchanged.
   */
  async updatePolicies(
    id: string,
    dto: UpdatePoliciesDto,
    user: AuthPayload,
  ): Promise<PoliciesResponseDto> {
    const hotel = await this.findHotelOrFail(id);
    await this.assertModeratorOwnsHotel(user, hotel);

    if (
      dto.checkInTime === undefined &&
      dto.checkOutTime === undefined &&
      dto.cancellationTiers === undefined
    ) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: {
          policies: [
            'Send at least one of checkInTime, checkOutTime or cancellationTiers',
          ],
        },
      });
    }

    if (dto.cancellationTiers !== undefined) {
      const problems = this.findTierProblems(dto.cancellationTiers);
      if (problems.length > 0) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: { cancellationTiers: problems },
        });
      }
    }

    if (dto.checkInTime !== undefined) hotel.checkInTime = dto.checkInTime;
    if (dto.checkOutTime !== undefined) hotel.checkOutTime = dto.checkOutTime;
    if (dto.cancellationTiers !== undefined) {
      hotel.policies = {
        cancellationTiers: dto.cancellationTiers.map((tier) => ({
          daysBeforeCheckIn: tier.daysBeforeCheckIn,
          refundPercentage: tier.refundPercentage,
        })),
      };
    }
    await hotel.save();

    return {
      id: hotel._id.toString(),
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationTiers: (hotel.policies?.cancellationTiers ?? []).map(
        (tier) => ({
          daysBeforeCheckIn: tier.daysBeforeCheckIn,
          refundPercentage: tier.refundPercentage,
        }),
      ),
    };
  }

  /** Returns one readable message per problem; an empty list means the tiers are valid. */
  private findTierProblems(tiers: unknown[]): string[] {
    const problems: string[] = [];
    const seenDays = new Set<number>();

    tiers.forEach((tier, index) => {
      const label = `Tier ${index + 1}`;
      const { daysBeforeCheckIn, refundPercentage } = (tier ?? {}) as Record<
        string,
        unknown
      >;

      if (
        typeof daysBeforeCheckIn !== 'number' ||
        !Number.isInteger(daysBeforeCheckIn) ||
        daysBeforeCheckIn < 0
      ) {
        problems.push(
          `${label}: days before check-in must be a whole number, 0 or more`,
        );
      } else if (seenDays.has(daysBeforeCheckIn)) {
        problems.push(
          `${label}: days before check-in ${daysBeforeCheckIn} is already used by another tier`,
        );
      } else {
        seenDays.add(daysBeforeCheckIn);
      }

      if (
        typeof refundPercentage !== 'number' ||
        !Number.isFinite(refundPercentage) ||
        refundPercentage < 0 ||
        refundPercentage > 100
      ) {
        problems.push(`${label}: refund percentage must be between 0 and 100`);
      }
    });

    return problems;
  }

  /** HTL-03: the assigned moderator adds an individually bookable room. */
  async createRoom(
    hotelId: string,
    dto: CreateRoomDto,
    user: AuthPayload,
  ): Promise<RoomResponseDto> {
    const hotel = await this.findHotelOrFail(hotelId);
    await this.assertModeratorOwnsHotel(user, hotel);

    // Room numbers are saved in capital letters, so compare them the same way.
    const roomNumber = dto.roomNumber.trim().toUpperCase();
    const duplicateMessage = `Room ${roomNumber} already exists in this hotel`;
    const existing = await this.roomModel
      .exists({ hotel: hotel._id, roomNumber })
      .exec();
    if (existing) {
      throw new ConflictException(duplicateMessage);
    }

    try {
      const room = await this.roomModel.create({
        hotel: hotel._id,
        roomNumber,
        type: dto.type,
        beds: dto.beds,
        maxOccupancy: dto.maxOccupancy,
        pricePerNight: dto.pricePerNight,
      });
      return this.toRoomResponse(room);
    } catch (error) {
      // Two requests can pass the check above together; the unique index catches the second.
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(duplicateMessage);
      }
      throw error;
    }
  }

  /** HTL-04: the assigned moderator defines a date range when a room can be booked. */
  async addRoomBookableRange(
    hotelId: string,
    roomId: string,
    dto: CreateRoomAvailabilityDto,
    user: AuthPayload,
  ): Promise<RoomAvailabilityResponseDto> {
    const hotel = await this.findHotelOrFail(hotelId);
    await this.assertModeratorOwnsHotel(user, hotel);
    const room = await this.findRoomOrFail(hotel, roomId);

    const start = this.parseDay(dto.startDate);
    const end = this.parseDay(dto.endDate);
    const errors: Record<string, string[]> = {};
    if (!start) {
      errors.startDate = [
        'Start date must be a real date in YYYY-MM-DD format',
      ];
    }
    if (!end) {
      errors.endDate = ['End date must be a real date in YYYY-MM-DD format'];
    }
    if (start && end && end < start) {
      errors.endDate = ['End date must be on or after the start date'];
    }
    if (!start || !end || Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    // Both days are included, so two ranges overlap when each starts on or before the other ends.
    const overlapping = await this.availabilityModel
      .findOne({
        room: room._id,
        type: AvailabilityType.AVAILABLE,
        startDate: { $lte: end },
        endDate: { $gte: start },
      })
      .exec();
    if (overlapping) {
      throw new ConflictException(
        `These dates overlap an existing bookable range (${this.formatDay(overlapping.startDate)} to ${this.formatDay(overlapping.endDate)})`,
      );
    }

    const range = await this.availabilityModel.create({
      room: room._id,
      hotel: hotel._id,
      type: AvailabilityType.AVAILABLE,
      startDate: start,
      endDate: end,
    });
    return this.toAvailabilityResponse(range);
  }

  /** HTL-05: change a room's beds, occupancy or price. Existing bookings keep the price they were made with. */
  async updateRoom(
    hotelId: string,
    roomId: string,
    dto: UpdateRoomDto,
    user: AuthPayload,
  ): Promise<RoomResponseDto> {
    const hotel = await this.findHotelOrFail(hotelId);
    await this.assertModeratorOwnsHotel(user, hotel);
    const room = await this.findRoomOrFail(hotel, roomId);

    if (
      dto.beds === undefined &&
      dto.maxOccupancy === undefined &&
      dto.pricePerNight === undefined
    ) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: {
          body: ['Send at least one of beds, maxOccupancy or pricePerNight'],
        },
      });
    }

    if (dto.beds !== undefined) room.beds = dto.beds;
    if (dto.maxOccupancy !== undefined) room.maxOccupancy = dto.maxOccupancy;
    if (dto.pricePerNight !== undefined) room.pricePerNight = dto.pricePerNight;
    await room.save();
    return this.toRoomResponse(room);
  }

  /**
   * HTL-05 (contract: PATCH /hotels/:id/rooms/:roomId/availability): change the dates
   * of a bookable range. Days taken out of the range must not have a confirmed booking.
   */
  async updateRoomBookableRange(
    hotelId: string,
    roomId: string,
    dto: UpdateRoomAvailabilityDto,
    user: AuthPayload,
  ): Promise<RoomAvailabilityResponseDto> {
    const hotel = await this.findHotelOrFail(hotelId);
    await this.assertModeratorOwnsHotel(user, hotel);
    const room = await this.findRoomOrFail(hotel, roomId);

    if (dto.startDate === undefined && dto.endDate === undefined) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { dates: ['Send startDate, endDate or both'] },
      });
    }
    const range = await this.availabilityModel
      .findOne({
        _id: dto.rangeId,
        room: room._id,
        type: AvailabilityType.AVAILABLE,
      })
      .exec();
    if (!range) {
      throw new NotFoundException('Bookable range not found');
    }

    const start =
      dto.startDate === undefined
        ? range.startDate
        : this.parseDay(dto.startDate);
    const end =
      dto.endDate === undefined ? range.endDate : this.parseDay(dto.endDate);
    const errors: Record<string, string[]> = {};
    if (!start) {
      errors.startDate = [
        'Start date must be a real date in YYYY-MM-DD format',
      ];
    }
    if (!end) {
      errors.endDate = ['End date must be a real date in YYYY-MM-DD format'];
    }
    if (start && end && end < start) {
      errors.endDate = ['End date must be on or after the start date'];
    }
    if (!start || !end || Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    const overlapping = await this.availabilityModel
      .findOne({
        _id: { $ne: range._id },
        room: room._id,
        type: AvailabilityType.AVAILABLE,
        startDate: { $lte: end },
        endDate: { $gte: start },
      })
      .exec();
    if (overlapping) {
      throw new ConflictException(
        `These dates overlap an existing bookable range (${this.formatDay(overlapping.startDate)} to ${this.formatDay(overlapping.endDate)})`,
      );
    }

    // The days that leave the range (before the new start, after the new end).
    const day = 24 * 60 * 60 * 1000;
    const removed: { from: Date; to: Date }[] = [];
    if (start > range.startDate) {
      removed.push({
        from: range.startDate,
        to: new Date(
          Math.min(start.getTime(), range.endDate.getTime() + day) - day,
        ),
      });
    }
    if (end < range.endDate) {
      removed.push({
        from: new Date(
          Math.max(end.getTime() + day, range.startDate.getTime()),
        ),
        to: range.endDate,
      });
    }
    if (removed.length > 0) {
      // A booking stays until its check-out day (not included).
      const confirmed = await this.bookingModel
        .exists({
          status: HotelBookingStatus.CONFIRMED,
          'rooms.room': room._id,
          $or: removed.map((part) => ({
            checkIn: { $lt: new Date(part.to.getTime() + day) },
            checkOut: { $gt: part.from },
          })),
        })
        .exec();
      if (confirmed) {
        throw new ConflictException(
          'These dates cannot be removed because the room has a confirmed reservation in them',
        );
      }
    }

    range.startDate = start;
    range.endDate = end;
    await range.save();
    return this.toAvailabilityResponse(range);
  }

  /**
   * HTL-05: remove a bookable range. Not allowed while a confirmed booking
   * for this room falls inside the range.
   */
  async removeRoomBookableRange(
    hotelId: string,
    roomId: string,
    rangeId: string,
    user: AuthPayload,
  ): Promise<RoomAvailabilityResponseDto> {
    const hotel = await this.findHotelOrFail(hotelId);
    await this.assertModeratorOwnsHotel(user, hotel);
    const room = await this.findRoomOrFail(hotel, roomId);

    if (!isValidObjectId(rangeId)) {
      throw new NotFoundException('Bookable range not found');
    }
    const range = await this.availabilityModel
      .findOne({
        _id: rangeId,
        room: room._id,
        type: AvailabilityType.AVAILABLE,
      })
      .exec();
    if (!range) {
      throw new NotFoundException('Bookable range not found');
    }

    // The range includes its last day; a booking stays until its check-out day (not included).
    const lastNight = new Date(range.endDate.getTime() + 24 * 60 * 60 * 1000);
    const confirmed = await this.bookingModel
      .exists({
        status: HotelBookingStatus.CONFIRMED,
        'rooms.room': room._id,
        checkIn: { $lt: lastNight },
        checkOut: { $gt: range.startDate },
      })
      .exec();
    if (confirmed) {
      throw new ConflictException(
        'This range cannot be removed because the room has a confirmed reservation in these dates',
      );
    }

    await range.deleteOne();
    return this.toAvailabilityResponse(range);
  }

  /** HTL-02: public hotel details page; lists free rooms when stay dates are sent. */
  async getDetails(
    id: string,
    query: HotelDetailsQueryDto,
  ): Promise<HotelDetailsResponseDto> {
    const hotel = await this.findHotelOrFail(id);
    if (!hotel.isActive) {
      throw new NotFoundException('Hotel not found');
    }
    const stay = this.parseStay(query);

    const [reviews, cityName, countryName] = await Promise.all([
      this.findRecentReviews(hotel._id),
      this.findCityName(hotel.city),
      this.findCountryName(hotel.country),
    ]);
    const details: HotelDetailsResponseDto = {
      id: hotel._id.toString(),
      name: hotel.name,
      description: hotel.description,
      address: hotel.address,
      city: hotel.city.toString(),
      cityName,
      country: hotel.country.toString(),
      countryName,
      starRating: hotel.starRating,
      amenities: hotel.amenities,
      images: hotel.images,
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationTiers: (hotel.policies?.cancellationTiers ?? []).map(
        (tier) => ({
          daysBeforeCheckIn: tier.daysBeforeCheckIn,
          refundPercentage: tier.refundPercentage,
        }),
      ),
      averageRating: hotel.averageRating,
      reviewCount: hotel.reviewCount,
      reviews,
    };
    if (stay) {
      details.availableRooms = await this.findAvailableRooms(
        hotel._id,
        stay.checkIn,
        stay.checkOut,
      );
    }
    return details;
  }

  /** Display name of the hotel's city; empty if the reference row is gone. */
  private async findCityName(cityId: Types.ObjectId): Promise<string> {
    const city = await this.cityModel.findById(cityId).lean().exec();
    return city?.name ?? '';
  }

  /** Display name of the hotel's country; empty if the reference row is gone. */
  private async findCountryName(countryId: Types.ObjectId): Promise<string> {
    const country = await this.countryModel.findById(countryId).lean().exec();
    return country?.name ?? '';
  }

  /** Both dates or none; check-out must be after check-in and check-in cannot be in the past. */
  private parseStay(
    query: HotelDetailsQueryDto,
  ): { checkIn: Date; checkOut: Date } | null {
    if (query.checkIn === undefined && query.checkOut === undefined) {
      return null;
    }
    const errors: Record<string, string[]> = {};
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const checkIn =
      query.checkIn === undefined ? null : this.parseDay(query.checkIn);
    const checkOut =
      query.checkOut === undefined ? null : this.parseDay(query.checkOut);
    if (query.checkIn === undefined) {
      errors.checkIn = ['Check-in is required when check-out is sent'];
    } else if (!checkIn) {
      errors.checkIn = ['Check-in must be a real date in YYYY-MM-DD format'];
    } else if (checkIn < today) {
      errors.checkIn = ['Check-in cannot be in the past'];
    }
    if (query.checkOut === undefined) {
      errors.checkOut = ['Check-out is required when check-in is sent'];
    } else if (!checkOut) {
      errors.checkOut = ['Check-out must be a real date in YYYY-MM-DD format'];
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      errors.checkOut = ['Check-out must be after the check-in day'];
    }
    if (!checkIn || !checkOut || Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
    return { checkIn, checkOut };
  }

  private async findRecentReviews(
    hotelId: Types.ObjectId,
  ): Promise<HotelReviewDto[]> {
    const reviews = await this.reviewModel
      .find({ hotel: hotelId, hidden: false })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec();
    if (reviews.length === 0) {
      return [];
    }
    const users = await this.userModel
      .find({ _id: { $in: reviews.map((r) => r.user) } })
      .select('firstName lastName')
      .lean()
      .exec();
    const names = new Map(
      users.map((u) => [
        u._id.toString(),
        `${u.firstName} ${(u.lastName ?? '').charAt(0)}.`.trim(),
      ]),
    );
    return reviews.map((review) => ({
      id: review._id.toString(),
      reviewer: names.get(review.user.toString()) ?? 'Guest',
      rating: review.rating,
      comment: review.comment ?? '',
      createdAt: (
        (review as { createdAt?: Date }).createdAt ?? new Date(0)
      ).toISOString(),
    }));
  }

  /**
   * A room is free for the stay when its bookable ranges cover every night, it is not
   * blocked on any night, and no confirmed booking or live hold overlaps the stay.
   */
  private async findAvailableRooms(
    hotelId: Types.ObjectId,
    checkIn: Date,
    checkOut: Date,
  ): Promise<AvailableRoomDto[]> {
    const dayMs = 24 * 60 * 60 * 1000;
    const lastNight = new Date(checkOut.getTime() - dayMs);

    const rooms = await this.roomModel
      .find({ hotel: hotelId, isActive: true })
      .sort({ roomNumber: 1 })
      .lean()
      .exec();
    if (rooms.length === 0) {
      return [];
    }
    const roomIds = rooms.map((room) => room._id);

    const [ranges, bookings] = await Promise.all([
      this.availabilityModel
        .find({
          room: { $in: roomIds },
          startDate: { $lte: lastNight },
          endDate: { $gte: checkIn },
        })
        .sort({ startDate: 1 })
        .lean()
        .exec(),
      this.bookingModel
        .find({
          hotel: hotelId,
          'rooms.room': { $in: roomIds },
          checkIn: { $lt: checkOut },
          checkOut: { $gt: checkIn },
          $or: [
            { status: HotelBookingStatus.CONFIRMED },
            {
              status: HotelBookingStatus.PENDING_PAYMENT,
              holdExpiresAt: { $gt: new Date() },
            },
          ],
        })
        .lean()
        .exec(),
    ]);

    const taken = new Set<string>();
    for (const booking of bookings) {
      for (const booked of booking.rooms) {
        taken.add(booked.room.toString());
      }
    }
    const blocked = new Set(
      ranges
        .filter((r) => r.type === AvailabilityType.BLOCKED)
        .map((r) => r.room.toString()),
    );

    return rooms
      .filter((room) => {
        const key = room._id.toString();
        if (taken.has(key) || blocked.has(key)) {
          return false;
        }
        // Walk the bookable ranges day by day; touching ranges count as one.
        let next = checkIn.getTime();
        for (const range of ranges) {
          if (
            range.room.toString() !== key ||
            range.type !== AvailabilityType.AVAILABLE
          ) {
            continue;
          }
          if (
            range.startDate.getTime() <= next &&
            range.endDate.getTime() >= next
          ) {
            next = range.endDate.getTime() + dayMs;
          }
        }
        return next > lastNight.getTime();
      })
      .map((room) => ({
        id: room._id.toString(),
        roomNumber: room.roomNumber,
        type: room.type,
        beds: room.beds,
        maxOccupancy: room.maxOccupancy,
        pricePerNight: room.pricePerNight,
        currency: PLATFORM_CURRENCY, // PAY-04: one platform currency (USD)
      }));
  }

  private async findRoomOrFail(
    hotel: HotelDocument,
    roomId: string,
  ): Promise<RoomDocument> {
    if (!isValidObjectId(roomId)) {
      throw new NotFoundException('Room not found');
    }
    const room = await this.roomModel
      .findOne({ _id: roomId, hotel: hotel._id })
      .exec();
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  /** Reads YYYY-MM-DD as midnight UTC; returns null for anything that is not a real calendar day. */
  private parseDay(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || this.formatDay(date) !== value
      ? null
      : date;
  }

  private formatDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toAvailabilityResponse(
    range: RoomAvailabilityDocument,
  ): RoomAvailabilityResponseDto {
    return {
      id: range._id.toString(),
      roomId: range.room.toString(),
      hotelId: range.hotel.toString(),
      type: range.type,
      startDate: this.formatDay(range.startDate),
      endDate: this.formatDay(range.endDate),
    };
  }

  private toRoomResponse(room: RoomDocument): RoomResponseDto {
    return {
      id: room._id.toString(),
      hotelId: room.hotel.toString(),
      roomNumber: room.roomNumber,
      type: room.type,
      beds: room.beds,
      maxOccupancy: room.maxOccupancy,
      pricePerNight: room.pricePerNight,
      isActive: room.isActive,
    };
  }

  private async findHotelOrFail(id: string): Promise<HotelDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Hotel not found');
    }
    const hotel = await this.hotelModel.findById(id).exec();
    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }
    return hotel;
  }

  private async assertModeratorOwnsHotel(
    user: AuthPayload,
    hotel: HotelDocument,
  ): Promise<void> {
    const assignment = isValidObjectId(user.sub)
      ? await this.assignmentModel
          .exists({
            moderatorId: new Types.ObjectId(user.sub),
            providerType: ProviderType.HOTEL,
            providerId: hotel._id,
          })
          .exec()
      : null;
    if (!assignment) {
      throw new ForbiddenException('You can only manage your assigned hotel');
    }
  }

  /** GEN-08: hotel photos must be files uploaded through the platform, not outside links. */
  private assertImagesAreUploads(images?: string[]): void {
    const outside = (images ?? []).filter(
      (url) => !this.uploads.isStoredUrl(ImageCategory.HOTEL, url),
    );
    if (outside.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: {
          images: [
            'Each image must be a photo uploaded to the platform (a /api/uploads/hotel/... link)',
          ],
        },
      });
    }
  }

  private async assertCityAndCountryExist(
    cityId?: string,
    countryId?: string,
  ): Promise<void> {
    const errors: Record<string, string[]> = {};

    if (
      cityId !== undefined &&
      !(await this.cityModel.exists({ _id: cityId }))
    ) {
      errors.city = ['City does not exist'];
    }
    if (
      countryId !== undefined &&
      !(await this.countryModel.exists({ _id: countryId }))
    ) {
      errors.country = ['Country does not exist'];
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
  }

  private toResponse(hotel: HotelDocument): HotelResponseDto {
    return {
      id: hotel._id.toString(),
      name: hotel.name,
      description: hotel.description,
      address: hotel.address,
      city: hotel.city.toString(),
      country: hotel.country.toString(),
      starRating: hotel.starRating,
      amenities: hotel.amenities,
      images: hotel.images,
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      averageRating: hotel.averageRating,
      reviewCount: hotel.reviewCount,
      isActive: hotel.isActive,
    };
  }
}
