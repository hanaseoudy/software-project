import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { RequestUser } from '../common/guards/roles.guard';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import {
  ModeratorAssignment,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { HotelResponseDto } from './dto/hotel-response.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import {
  CancellationTiersResponseDto,
  UpdateCancellationTiersDto,
} from './dto/update-cancellation-tiers.dto';
import { UpdateCheckTimesDto } from './dto/update-check-times.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { Room, RoomDocument } from './schemas/room.schema';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignment>,
  ) {}

  /** HTL-01: an admin creates a hotel profile. */
  async create(dto: CreateHotelDto): Promise<HotelResponseDto> {
    await this.assertCityAndCountryExist(dto.city, dto.country);

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
    user: RequestUser,
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

    hotel.set(changes);
    await hotel.save();

    return this.toResponse(hotel);
  }

  /** HTL-09: the assigned moderator sets the standard check-in/check-out times. */
  async updateCheckTimes(
    id: string,
    dto: UpdateCheckTimesDto,
    user: RequestUser,
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
    user: RequestUser,
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
    user: RequestUser,
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
    user: RequestUser,
    hotel: HotelDocument,
  ): Promise<void> {
    const assignment = isValidObjectId(user.id)
      ? await this.assignmentModel
          .exists({
            moderatorId: new Types.ObjectId(user.id),
            providerType: ProviderType.HOTEL,
            providerId: hotel._id,
          })
          .exec()
      : null;
    if (!assignment) {
      throw new ForbiddenException('You can only manage your assigned hotel');
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
