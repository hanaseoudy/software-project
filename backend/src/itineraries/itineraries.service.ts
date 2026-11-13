
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';

import {
  Itinerary,
  ItineraryDocument,
  ItineraryVisibility,
} from './schemas/itinerary.schema';

import {
  Country,
  CountryDocument,
} from '../reference-data/schemas/country.schema';

import { ItineraryDay, ItineraryDayDocument } from './schemas/itinerary-day.schema';
import { Activity, ActivityDocument } from './schemas/activity.schema';
import { BudgetEntry, BudgetEntryDocument } from './schemas/budget-entry.schema';
import { TransportCost, TransportCostDocument } from './schemas/transport-cost.schema';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';

@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<ItineraryDocument>,

    @InjectModel(Country.name)
    private readonly countryModel: Model<CountryDocument>,

    @InjectModel(ItineraryDay.name)
    private readonly itineraryDayModel: Model<ItineraryDayDocument>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(BudgetEntry.name)
    private readonly budgetEntryModel: Model<BudgetEntryDocument>,
    @InjectModel(TransportCost.name)
    private readonly transportCostModel: Model<TransportCostDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private async validateCountries(countryIds: string[]): Promise<void> {
    if (!Array.isArray(countryIds) || countryIds.length === 0 ||
        countryIds.some(code => typeof code !== 'string' || !/^[A-Z]{2}$/.test(code))) {
      throw new BadRequestException({ message: 'Validation failed', errors: { countryIds: ['Country codes must be two uppercase letters and the list cannot be empty'] } });
    }
    if (new Set(countryIds).size !== countryIds.length) {
      throw new BadRequestException({ message: 'Validation failed', errors: { countryIds: ['Duplicate country codes are not allowed'] } });
    }
    const countries = await this.countryModel.find({ code: { $in: countryIds } }, { code: 1, _id: 0 }).lean();
    const supported = new Set(countries.map(country => country.code));
    const unsupported = countryIds.filter(code => !supported.has(code));
    if (unsupported.length) {
      throw new BadRequestException({ message: 'Validation failed', errors: { countryIds: [`Unsupported country code(s): ${unsupported.join(', ')}`] } });
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
      startDate: new Date(`${dto.startDate}T00:00:00.000Z`),
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
      itinerary.startDate = new Date(`${dto.startDate}T00:00:00.000Z`);
    }

    return itinerary.save();
  }

  async remove(userId: string, itineraryId: string) {
    this.validateObjectId(itineraryId);
    const itineraryObjectId = new Types.ObjectId(itineraryId);
    const ownerId = new Types.ObjectId(userId);

    await this.connection.transaction(async (session) => {
      const itinerary = await this.itineraryModel.findById(itineraryObjectId).session(session);
      if (!itinerary) throw new NotFoundException('Itinerary not found');
      if (itinerary.userId.toString() !== userId) {
        throw new ForbiddenException("You cannot delete another user's itinerary");
      }

      const days = await this.itineraryDayModel.find(
        { itineraryId: itineraryObjectId }, { _id: 1 }, { session },
      ).lean();
      const dayIds = days.map(day => day._id);
      await this.activityModel.deleteMany({ dayId: { $in: dayIds } }, { session });
      await this.budgetEntryModel.deleteMany({ dayId: { $in: dayIds } }, { session });
      await this.transportCostModel.deleteMany({ dayId: { $in: dayIds } }, { session });
      await this.itineraryDayModel.deleteMany({ itineraryId: itineraryObjectId }, { session });
      const result = await this.itineraryModel.deleteOne(
        { _id: itineraryObjectId, userId: ownerId }, { session },
      );
      if (result.deletedCount !== 1) throw new NotFoundException('Itinerary not found or already deleted');
    });
    return { message: 'Itinerary deleted successfully' };
  }
}
