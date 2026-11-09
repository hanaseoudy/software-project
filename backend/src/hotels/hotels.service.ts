import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import {
  ModeratorAssignment,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { HotelResponseDto } from './dto/hotel-response.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { UploadsService } from '../uploads/uploads.service';
import { ImageCategory } from '../uploads/uploads.constants';
import { Hotel, HotelDocument } from './schemas/hotel.schema';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignment>,
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
