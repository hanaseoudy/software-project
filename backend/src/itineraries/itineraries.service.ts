import {
  BadRequestException,
  ConflictException,
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
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';

import { City, CityDocument } from '../reference-data/schemas/city.schema';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
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
    @InjectModel(City.name)
private readonly cityModel: Model<CityDocument>,
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

  private validateObjectId(id: string, label = 'itinerary') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label} ID`);
    }
  }

  // ITN-03: Paginated list, including the number of days in each itinerary.
  async findAll(userId: string, page = 1) {
    const filter = { userId: new Types.ObjectId(userId) };
    const [total, itineraries] = await Promise.all([
      this.itineraryModel.countDocuments(filter),
      this.itineraryModel.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .lean(),
    ]);

    const ids = itineraries.map(itinerary => itinerary._id);
    const counts = ids.length
      ? await this.itineraryDayModel.aggregate<{ _id: Types.ObjectId; count: number }>([
          { $match: { itineraryId: { $in: ids } } },
          { $group: { _id: '$itineraryId', count: { $sum: 1 } } },
        ])
      : [];
    const countsById = new Map(counts.map(item => [item._id.toString(), item.count]));

    const items = itineraries.map(itinerary => ({
      id: itinerary._id.toString(),
      title: itinerary.title,
      countryIds: itinerary.countryIds,
      startDate: itinerary.startDate.toISOString().slice(0, 10),
      visibility: itinerary.visibility,
      dayCount: countsById.get(itinerary._id.toString()) ?? 0,
    }));

    return paginate(items, total, page);
  }

  // ITN-03: Details include days ordered by dayNumber, with derived dates.
  async findOne(userId: string, itineraryId: string) {
    this.validateObjectId(itineraryId);
    const itinerary = await this.itineraryModel.findOne({
      _id: new Types.ObjectId(itineraryId),
      userId: new Types.ObjectId(userId),
    }).lean();

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    const days = await this.itineraryDayModel
      .find({ itineraryId: itinerary._id })
      .sort({ dayNumber: 1 })
      .lean();

    const formattedDays = days.map(day => {
      const date = new Date(itinerary.startDate);
      date.setUTCDate(date.getUTCDate() + day.dayNumber - 1);
      return {
        id: day._id.toString(),
        dayNumber: day.dayNumber,
        cityId: day.cityId,
        notes: day.notes ?? '',
        date: date.toISOString().slice(0, 10),
      };
    });

    return {
      id: itinerary._id.toString(),
      title: itinerary.title,
      countryIds: itinerary.countryIds,
      startDate: itinerary.startDate.toISOString().slice(0, 10),
      visibility: itinerary.visibility,
      dayCount: formattedDays.length,
      days: formattedDays,
    };
  }

  private async getOwnedItinerary(
    userId: string,
    itineraryId: string,
  ) {
    this.validateObjectId(itineraryId);

    const itinerary = await this.itineraryModel.findOne({
      _id: new Types.ObjectId(itineraryId),
      userId: new Types.ObjectId(userId),
    });

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return itinerary;
  }

  private async validateCity(cityId: string) {
    const city = await this.cityModel.findOne({ cityId });

    if (!city) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { cityId: ['Invalid cityId'] },
      });
    }

    return city;
  }

  private deriveDayDate(
    startDate: Date,
    dayNumber: number,
  ): string {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayNumber - 1);
    return date.toISOString().slice(0, 10);
  }

  // ITN-05: Add a new itinerary day
  async addDay(
    userId: string,
    itineraryId: string,
    dto: CreateItineraryDayDto,
  ) {
    const itinerary = await this.getOwnedItinerary(
      userId,
      itineraryId,
    );

    await this.validateCity(dto.cityId);

    // Retry if two requests try to create the same day number.
    for (let attempt = 0; attempt < 5; attempt++) {
      const lastDay = await this.itineraryDayModel
        .findOne({ itineraryId: itinerary._id })
        .sort({ dayNumber: -1 })
        .lean();

      const dayNumber = lastDay ? lastDay.dayNumber + 1 : 1;

      if (dayNumber > 60) {
        throw new BadRequestException(
          'An itinerary cannot exceed 60 days',
        );
      }

      try {
        const day = await this.itineraryDayModel.create({
          itineraryId: itinerary._id,
          dayNumber,
          cityId: dto.cityId,
          notes: dto.notes,
        });

        return {
          ...day.toObject(),
          date: this.deriveDayDate(
            itinerary.startDate,
            dayNumber,
          ),
        };
      } catch (error: unknown) {
        // MongoDB duplicate-key error.
        // Another request may have created this day number first.
        const isDuplicateKey =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000;

        if (!isDuplicateKey) {
          throw error;
        }
      }
    }

    throw new ConflictException(
      'Could not add itinerary day due to concurrent updates. Please retry.',
    );
  }


  // ITN-05: List days in sequential order
  async findDays(userId: string, itineraryId: string) {
    const itinerary = await this.getOwnedItinerary(
      userId,
      itineraryId,
    );

    const days = await this.itineraryDayModel
      .find({ itineraryId: itinerary._id })
      .sort({ dayNumber: 1 })
      .lean();

    return days.map((day) => ({
      ...day,
      date: this.deriveDayDate(
        itinerary.startDate,
        day.dayNumber,
      ),
    }));
  }

  // ITN-05: Update a day's city or notes
  async updateDay(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: UpdateItineraryDayDto,
  ) {
    const itinerary = await this.getOwnedItinerary(
      userId,
      itineraryId,
    );

    this.validateObjectId(dayId, 'day');

    const day = await this.itineraryDayModel.findOne({
      _id: new Types.ObjectId(dayId),
      itineraryId: itinerary._id,
    });

    if (!day) {
      throw new NotFoundException('Itinerary day not found');
    }

    if (dto.cityId !== undefined) {
      await this.validateCity(dto.cityId);
      day.cityId = dto.cityId;
    }

    if (dto.notes !== undefined) {
      day.notes = dto.notes;
    }

    await day.save();

    return {
      ...day.toObject(),
      date: this.deriveDayDate(
        itinerary.startDate,
        day.dayNumber,
      ),
    };
  }


  // ITN-01: Keep existing create, update and delete behavior unchanged.
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

  async update(userId: string, itineraryId: string, dto: UpdateItineraryDto) {
    this.validateObjectId(itineraryId);
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }
    if (itinerary.userId.toString() !== userId) {
      throw new ForbiddenException('You cannot edit another user\'s itinerary');
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
