import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';

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

  // All day writers must modify the parent BEFORE reading its days. The unique
  // index prevents duplicates; this shared write also prevents concurrent gaps.
  private async withDayTransaction<T>(
    userId: string,
    itineraryId: string,
    work: (session: ClientSession, itinerary: Itinerary & { _id: Types.ObjectId }) => Promise<T>,
    forbiddenOnOtherOwner = false,
  ): Promise<T> {
    this.validateObjectId(itineraryId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const session = await this.connection.startSession();
      let commitUncertain = false;
      try {
        session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 5000 });
        const itinerary = await this.itineraryModel.findOneAndUpdate(
          { _id: new Types.ObjectId(itineraryId), userId: new Types.ObjectId(userId) },
          { $inc: { __v: 1 } },
          { session, returnDocument: 'after' },
        ).lean();
        if (!itinerary) {
          if (forbiddenOnOtherOwner && await this.itineraryModel.exists({ _id: new Types.ObjectId(itineraryId) }).session(session)) {
            throw new ForbiddenException("You cannot delete another user's itinerary");
          }
          throw new NotFoundException('Itinerary not found');
        }
        const result = await work(session, itinerary);
        // An ambiguous commit must retry COMMIT, never replay the deletion.
        for (let commitAttempt = 0; commitAttempt < 5; commitAttempt++) {
          try {
            await session.commitTransaction();
            return result;
          } catch (error) {
            // The latest response decides uncertainty; this label wins if both are present.
            commitUncertain = this.hasErrorLabel(error, 'UnknownTransactionCommitResult');
            if (!commitUncertain) throw error;
          }
        }
        throw new ServiceUnavailableException('Transaction outcome is uncertain. Refresh the itinerary before retrying.');
      } catch (error) {
        if (!commitUncertain && session.inTransaction()) await session.abortTransaction();
        if (commitUncertain || !this.hasErrorLabel(error, 'TransientTransactionError')) throw error;
        if (attempt === 4) throw new ConflictException('Itinerary changed concurrently. Please retry.');
        await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt));
      } finally {
        await session.endSession();
      }
    }
    throw new ConflictException('Itinerary changed concurrently. Please retry.');
  }

  private hasErrorLabel(error: unknown, label: string): boolean {
    return typeof error === 'object' && error !== null &&
      'hasErrorLabel' in error && typeof error.hasErrorLabel === 'function' &&
      error.hasErrorLabel(label) === true;
  }

  // ITN-05: preserve append semantics and enforce the limit under the same lock.
  async addDay(userId: string, itineraryId: string, dto: CreateItineraryDayDto) {
    return this.withDayTransaction(userId, itineraryId, async (session, itinerary) => {
      await this.validateCity(dto.cityId);
      const lastDay = await this.itineraryDayModel.findOne({ itineraryId: itinerary._id })
        .sort({ dayNumber: -1 }).session(session).lean();
      const dayNumber = lastDay ? lastDay.dayNumber + 1 : 1;
      if (dayNumber > 60) throw new BadRequestException('An itinerary cannot exceed 60 days');
      const [day] = await this.itineraryDayModel.create([{
        itineraryId: itinerary._id, dayNumber, cityId: dto.cityId, notes: dto.notes,
      }], { session });
      return { ...day.toObject(), date: this.deriveDayDate(itinerary.startDate, dayNumber) };
    });
  }

  private async deleteDayExpenses(dayIds: Types.ObjectId[], session: ClientSession) {
    const filter = { dayId: { $in: dayIds } };
    // Operations sharing a transaction/session must run sequentially.
    await this.activityModel.deleteMany(filter, { session });
    await this.budgetEntryModel.deleteMany(filter, { session });
    await this.transportCostModel.deleteMany(filter, { session });
  }

  // ITN-07 only: native-currency totals. The full summary and FX conversion
  // endpoints belong to ITN-14 / ITN-18. Decimal aggregation avoids 0.1 + 0.2 drift.
  private async survivingBudgetTotals(itineraryId: Types.ObjectId, session: ClientSession) {
    const sources = [
      { model: this.activityModel, field: 'cost', name: 'activityCosts' },
      { model: this.budgetEntryModel, field: 'amount', name: 'budgetCosts' },
      { model: this.transportCostModel, field: 'amount', name: 'transportCosts' },
    ];
    const totals = await this.itineraryDayModel.aggregate<{ currency: string; total: number }>([
      { $match: { itineraryId } },
      ...sources.map(({ model, field, name }) => ({ $lookup: {
        from: model.collection.name, let: { day: '$_id' }, as: name,
        pipeline: [
          { $match: { $expr: { $eq: ['$dayId', '$$day'] }, [field]: { $ne: null } } },
          { $group: { _id: '$currency', amount: { $sum: { $toDecimal: { $toString: `$${field}` } } } } },
          { $project: { _id: 0, currency: '$_id', amount: 1 } },
        ],
      } })),
      { $project: { expenses: { $concatArrays: sources.map(source => `$${source.name}`) } } },
      { $unwind: '$expenses' },
      { $group: { _id: '$expenses.currency', total: { $sum: '$expenses.amount' } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, currency: '$_id', total: { $toDouble: '$total' } } },
    ]).session(session);
    if (totals.some(item => !item.currency || !Number.isFinite(item.total))) {
      throw new ConflictException('Existing expenses have invalid amounts or missing currencies. Correct them before deleting a day.');
    }
    return totals;
  }

  async removeDay(userId: string, itineraryId: string, dayId: string) {
    this.validateObjectId(itineraryId);
    this.validateObjectId(dayId, 'day');
    return this.withDayTransaction(userId, itineraryId, async (session, itinerary) => {
      const day = await this.itineraryDayModel.findOne({
        _id: new Types.ObjectId(dayId), itineraryId: itinerary._id,
      }).session(session).lean();
      if (!day) throw new NotFoundException('Itinerary day not found');
      await this.deleteDayExpenses([day._id], session);
      await this.itineraryDayModel.deleteOne({ _id: day._id, itineraryId: itinerary._id }, { session });
      const laterDays = await this.itineraryDayModel.find({
        itineraryId: itinerary._id, dayNumber: { $gt: day.dayNumber },
      }).sort({ dayNumber: 1 }).session(session).lean();
      // Free the next number before moving its successor. Never use unordered
      // bulk updates or temporary numbers with this unique index.
      for (const later of laterDays) {
        await this.itineraryDayModel.updateOne(
          { _id: later._id, itineraryId: itinerary._id },
          { $inc: { dayNumber: -1 } }, { session, runValidators: true },
        );
      }
      const days = await this.itineraryDayModel.find({ itineraryId: itinerary._id })
        .sort({ dayNumber: 1 }).session(session).lean();
      const budgetTotals = await this.survivingBudgetTotals(itinerary._id, session);
      return {
        message: 'Itinerary day deleted successfully',
        days: days.map(item => ({ ...item, date: this.deriveDayDate(itinerary.startDate, item.dayNumber) })),
        budgetTotals,
      };
    });
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
    this.validateObjectId(itineraryId);
    this.validateObjectId(dayId, 'day');
    return this.withDayTransaction(userId, itineraryId, async (session, itinerary) => {
      const changes: { cityId?: string; notes?: string } = {};
      if (dto.cityId !== undefined) {
        await this.validateCity(dto.cityId);
        changes.cityId = dto.cityId;
      }
      if (dto.notes !== undefined) changes.notes = dto.notes;
      // Explicit field update never writes a previously read dayNumber.
      const day = await this.itineraryDayModel.findOneAndUpdate(
        { _id: new Types.ObjectId(dayId), itineraryId: itinerary._id },
        { $set: changes }, { session, returnDocument: 'after', runValidators: true },
      );
      if (!day) throw new NotFoundException('Itinerary day not found');
      return { ...day.toObject(), date: this.deriveDayDate(itinerary.startDate, day.dayNumber) };
    });
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
    await this.withDayTransaction(userId, itineraryId, async (session, itinerary) => {
      const days = await this.itineraryDayModel.find(
        { itineraryId: itinerary._id }, { _id: 1 }, { session },
      ).lean();
      await this.deleteDayExpenses(days.map(day => day._id), session);
      await this.itineraryDayModel.deleteMany({ itineraryId: itinerary._id }, { session });
      const result = await this.itineraryModel.deleteOne(
        { _id: itinerary._id, userId: new Types.ObjectId(userId) }, { session },
      );
      if (result.deletedCount !== 1) throw new NotFoundException('Itinerary not found or already deleted');
    }, true);
    return { message: 'Itinerary deleted successfully' };
  }
}
