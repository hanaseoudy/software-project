import {
  BadRequestException,
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
import { HotelResponseDto } from './dto/hotel-response.dto';
import { UpdateCheckTimesDto } from './dto/update-check-times.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { Hotel, HotelDocument } from './schemas/hotel.schema';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
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
