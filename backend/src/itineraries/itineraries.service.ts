
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Itinerary,
  ItineraryDocument,
  ItineraryVisibility,
} from './schemas/itinerary.schema';

import {
  Country,
  CountryDocument,
} from '../reference-data/schemas/country.schema';

import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';

@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<ItineraryDocument>,

    @InjectModel(Country.name)
    private readonly countryModel: Model<CountryDocument>,
  ) {}

  private async validateCountries(countryIds: string[]) {
    const uniqueCodes = [...new Set(countryIds)];

    const count = await this.countryModel.countDocuments({
      code: { $in: uniqueCodes },
    });

    if (count !== uniqueCodes.length) {
      throw new BadRequestException(
        'One or more selected countries are invalid',
      );
    }
  }

  private validateObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid itinerary ID');
    }
  }

  async create(userId: string, dto: CreateItineraryDto) {
    await this.validateCountries(dto.countryIds);

    return this.itineraryModel.create({
      userId: new Types.ObjectId(userId),
      title: dto.title,
      countryIds: dto.countryIds,
      startDate: new Date(dto.startDate),
      visibility: ItineraryVisibility.PRIVATE,
    });
  }

  async update(
    userId: string,
    itineraryId: string,
    dto: UpdateItineraryDto,
  ) {
    this.validateObjectId(itineraryId);

    const itinerary = await this.itineraryModel.findById(itineraryId);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    if (itinerary.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You cannot edit another user\'s itinerary',
      );
    }

    if (dto.countryIds !== undefined) {
      await this.validateCountries(dto.countryIds);
      itinerary.countryIds = dto.countryIds;
    }

    if (dto.title !== undefined) {
      itinerary.title = dto.title;
    }

    if (dto.startDate !== undefined) {
      itinerary.startDate = new Date(dto.startDate);
    }

    return itinerary.save();
  }

  async remove(userId: string, itineraryId: string) {
    this.validateObjectId(itineraryId);

    const itinerary = await this.itineraryModel.findById(itineraryId);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    if (itinerary.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You cannot delete another user\'s itinerary',
      );
    }

    await this.itineraryModel.deleteOne({
      _id: itinerary._id,
      userId: new Types.ObjectId(userId),
    });

    return { message: 'Itinerary deleted successfully' };
  }
}
