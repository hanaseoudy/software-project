import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import {
  ItineraryDay,
  ItineraryDayDocument,
} from './schemas/itinerary-day.schema';
import { Activity, ActivityDocument } from './schemas/activity.schema';
import {
  Currency,
  CurrencyDocument,
} from '../reference-data/schemas/currency.schema';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraries: Model<ItineraryDocument>,
    @InjectModel(ItineraryDay.name)
    private readonly days: Model<ItineraryDayDocument>,
    @InjectModel(Activity.name)
    private readonly activities: Model<ActivityDocument>,
    @InjectModel(Currency.name)
    private readonly currencies: Model<CurrencyDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private objectId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException(`Invalid ${field} ID`);
    return new Types.ObjectId(id);
  }

  private invalid(field: string, message: string): never {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: { [field]: [message] },
    });
  }

  private labelled(error: unknown, label: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'hasErrorLabel' in error &&
      typeof error.hasErrorLabel === 'function' &&
      error.hasErrorLabel(label) === true
    );
  }

  // Independent of ITN-07 code: shared protocol is an actual parent __v write,
  // followed by fresh child reads in the SAME transaction. All future day
  // deletion/reorder writers must participate for this coordination to hold.
  private async withParent<T>(
    userId: string,
    itineraryId: Types.ObjectId,
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const session = await this.connection.startSession();
      let uncertain = false;
      try {
        session.startTransaction({
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          maxCommitTimeMS: 5000,
        });
        const parent = await this.itineraries
          .findOneAndUpdate(
            { _id: itineraryId, userId: new Types.ObjectId(userId) },
            { $inc: { __v: 1 } },
            { session },
          )
          .lean();
        if (!parent)
          throw new NotFoundException('Activity or itinerary day not found');
        const result = await work(session);
        for (let commit = 0; commit < 5; commit++) {
          try {
            await session.commitTransaction();
            return result;
          } catch (error) {
            // Unknown result takes precedence when both labels are present.
            uncertain = this.labelled(error, 'UnknownTransactionCommitResult');
            if (!uncertain) throw error;
          }
        }
        throw new ServiceUnavailableException(
          'Transaction outcome is uncertain. Refresh before retrying.',
        );
      } catch (error) {
        if (!uncertain && session.inTransaction())
          await session.abortTransaction();
        if (uncertain || !this.labelled(error, 'TransientTransactionError'))
          throw error;
        if (attempt === 4)
          throw new ConflictException(
            'Itinerary changed concurrently. Please retry.',
          );
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      } finally {
        await session.endSession();
      }
    }
    throw new ConflictException(
      'Itinerary changed concurrently. Please retry.',
    );
  }

  private async dayExists(
    dayId: Types.ObjectId,
    itineraryId: Types.ObjectId,
    session: ClientSession,
  ) {
    if (!(await this.days.exists({ _id: dayId, itineraryId }).session(session)))
      throw new NotFoundException('Activity or itinerary day not found');
  }

  private async currencyFor(
    cost: number | undefined,
    currency: string | undefined,
    session: ClientSession,
  ) {
    if (cost === undefined) {
      if (currency !== undefined)
        this.invalid('currency', 'Currency requires a cost');
    } else if (
      !currency ||
      !(await this.currencies.exists({ code: currency }).session(session))
    ) {
      this.invalid(
        'currency',
        'A supported currency is required when cost is present',
      );
    }
  }

  async create(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: CreateActivityDto,
  ) {
    const parentId = this.objectId(itineraryId, 'itinerary');
    const childId = this.objectId(dayId, 'day');
    return this.withParent(userId, parentId, async (session) => {
      await this.dayExists(childId, parentId, session);
      const cost = dto.cost ?? undefined;
      await this.currencyFor(cost, dto.currency, session);
      const [activity] = await this.activities.create(
        [
          {
            dayId: childId,
            name: dto.name,
            description: dto.description,
            ...(dto.time != null ? { time: dto.time } : {}),
            ...(cost !== undefined ? { cost, currency: dto.currency } : {}),
          },
        ],
        { session },
      );
      return ActivityResponseDto.from(activity);
    });
  }

  private async locate(activityId: Types.ObjectId) {
    // Discovery only, not authorization. Everything is rechecked after the
    // parent write; these pre-transaction child reads never authorize a write.
    const activity = await this.activities
      .findById(activityId)
      .select('dayId')
      .lean();
    if (!activity)
      throw new NotFoundException('Activity or itinerary day not found');
    const day = await this.days
      .findById(activity.dayId)
      .select('itineraryId')
      .lean();
    if (!day)
      throw new NotFoundException('Activity or itinerary day not found');
    return { dayId: activity.dayId, itineraryId: day.itineraryId };
  }

  async update(userId: string, id: string, dto: UpdateActivityDto) {
    const activityId = this.objectId(id, 'activity');
    if (
      ![dto.name, dto.description, dto.time, dto.cost, dto.currency].some(
        (value) => value !== undefined,
      )
    ) {
      throw new BadRequestException(
        'Provide at least one editable activity field',
      );
    }
    const location = await this.locate(activityId);
    return this.withParent(userId, location.itineraryId, async (session) => {
      await this.dayExists(location.dayId, location.itineraryId, session);
      const activity = await this.activities
        .findOne({ _id: activityId, dayId: location.dayId })
        .session(session);
      if (!activity)
        throw new NotFoundException('Activity or itinerary day not found');
      const cost =
        dto.cost === undefined ? activity.cost : (dto.cost ?? undefined);
      // Clearing cost also clears currency, regardless of previous values.
      const currency =
        dto.cost === null ? undefined : (dto.currency ?? activity.currency);
      if (dto.cost === null && dto.currency !== undefined)
        this.invalid('currency', 'Do not supply currency when clearing cost');
      await this.currencyFor(cost, currency, session);
      if (dto.name !== undefined) activity.name = dto.name;
      if (dto.description !== undefined) activity.description = dto.description;
      if (dto.time !== undefined) activity.time = dto.time ?? undefined;
      activity.cost = cost;
      activity.currency = currency;
      await activity.save({ session });
      return ActivityResponseDto.from(activity);
    });
  }

  async remove(userId: string, id: string) {
    const activityId = this.objectId(id, 'activity');
    const location = await this.locate(activityId);
    return this.withParent(userId, location.itineraryId, async (session) => {
      await this.dayExists(location.dayId, location.itineraryId, session);
      const result = await this.activities.deleteOne(
        { _id: activityId, dayId: location.dayId },
        { session },
      );
      if (result.deletedCount !== 1)
        throw new NotFoundException('Activity or itinerary day not found');
      return { message: 'Activity deleted successfully' };
    });
  }
}
