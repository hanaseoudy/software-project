import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { isNumber } from 'class-validator';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import {
  ItineraryDay,
  ItineraryDayDocument,
} from './schemas/itinerary-day.schema';
import {
  BudgetCategory,
  BudgetEntry,
  BudgetEntryDocument,
} from './schemas/budget-entry.schema';
import { Activity, ActivityDocument } from './schemas/activity.schema';
import {
  TransportCost,
  TransportCostDocument,
} from './schemas/transport-cost.schema';
import {
  Currency,
  CurrencyDocument,
} from '../reference-data/schemas/currency.schema';
import { CreateBudgetEntryDto } from './dto/create-budget-entry.dto';
import { UpdateBudgetEntryDto } from './dto/update-budget-entry.dto';
import { BudgetEntryResponseDto } from './dto/budget-entry-response.dto';
import {
  BudgetCurrencyTotalDto,
  ItineraryBudgetTotalsResponseDto,
} from './dto/itinerary-budget-totals-response.dto';

@Injectable()
export class BudgetEntriesService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraries: Model<ItineraryDocument>,
    @InjectModel(ItineraryDay.name)
    private readonly days: Model<ItineraryDayDocument>,
    @InjectModel(BudgetEntry.name)
    private readonly entries: Model<BudgetEntryDocument>,
    @InjectModel(Activity.name)
    private readonly activities: Model<ActivityDocument>,
    @InjectModel(TransportCost.name)
    private readonly transports: Model<TransportCostDocument>,
    @InjectModel(Currency.name)
    private readonly currencies: Model<CurrencyDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  private invalid(field: string, message: string): never {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: { [field]: [message] },
    });
  }

  private objectId(value: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value))
      this.invalid(field, 'Must be a valid MongoDB ID');
    return new Types.ObjectId(value);
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

  // Protocol compatibility, not an ITN-07 dependency: serialize cooperating
  // writers through an actual owned-parent write BEFORE authoritative child reads.
  private async withParent<T>(
    userId: string,
    parentId: Types.ObjectId,
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
            { _id: parentId, userId: new Types.ObjectId(userId) },
            { $inc: { __v: 1 } },
            { session },
          )
          .lean();
        if (!parent)
          throw new NotFoundException(
            'Budget entry or itinerary day not found',
          );
        const result = await work(session);
        for (let commit = 0; commit < 5; commit++) {
          try {
            await session.commitTransaction();
            return result;
          } catch (error) {
            // Unknown result wins if both labels appear. The latest definitive
            // transient failure can safely restart the whole transaction.
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
    parentId: Types.ObjectId,
    session: ClientSession,
  ) {
    if (
      !(await this.days
        .exists({ _id: dayId, itineraryId: parentId })
        .session(session))
    ) {
      throw new NotFoundException('Budget entry or itinerary day not found');
    }
  }

  private async validateRecord(record: BudgetEntry, session: ClientSession) {
    if (!Object.values(BudgetCategory).includes(record.category))
      this.invalid('category', 'Unsupported budget category');
    if (
      !isNumber(record.amount, {
        maxDecimalPlaces: 2,
        allowNaN: false,
        allowInfinity: false,
      }) ||
      record.amount < 0
    )
      this.invalid(
        'amount',
        'Must be a finite nonnegative number with at most two decimal places',
      );
    if (
      typeof record.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(record.currency) ||
      !(await this.currencies
        .exists({ code: record.currency })
        .session(session))
    )
      this.invalid('currency', 'Must be a supported GEN-12 currency');
    if (
      record.description !== undefined &&
      typeof record.description !== 'string'
    )
      this.invalid('description', 'Must be a string');
  }

  async create(
    userId: string,
    itineraryId: string,
    day: string,
    dto: CreateBudgetEntryDto,
  ) {
    const parentId = this.objectId(itineraryId, 'itineraryId'),
      dayId = this.objectId(day, 'dayId');
    return this.withParent(userId, parentId, async (session) => {
      await this.dayExists(dayId, parentId, session);
      const record: BudgetEntry = {
        dayId,
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency,
        ...(dto.description === undefined
          ? {}
          : { description: dto.description }),
      };
      await this.validateRecord(record, session);
      const [entry] = await this.entries.create([record], { session });
      return BudgetEntryResponseDto.from(entry);
    });
  }

  private async locate(entryId: Types.ObjectId) {
    // Discovery is not authorization. Recheck all relationships after the parent write.
    const entry = await this.entries.findById(entryId).select('dayId').lean();
    const day =
      entry &&
      (await this.days.findById(entry.dayId).select('itineraryId').lean());
    if (!day)
      throw new NotFoundException('Budget entry or itinerary day not found');
    return day.itineraryId;
  }

  async update(userId: string, id: string, dto: UpdateBudgetEntryDto) {
    const entryId = this.objectId(id, 'id');
    if (
      ![dto.category, dto.amount, dto.currency, dto.description].some(
        (value) => value !== undefined,
      )
    )
      this.invalid('body', 'Provide at least one editable budget-entry field');
    const parentId = await this.locate(entryId);
    return this.withParent(userId, parentId, async (session) => {
      const entry = await this.entries.findById(entryId).session(session);
      if (!entry)
        throw new NotFoundException('Budget entry or itinerary day not found');
      await this.dayExists(entry.dayId, parentId, session);
      const record: BudgetEntry = {
        dayId: entry.dayId,
        category: dto.category === undefined ? entry.category : dto.category,
        amount: dto.amount === undefined ? entry.amount : dto.amount,
        currency: dto.currency === undefined ? entry.currency : dto.currency,
        description:
          dto.description === undefined ? entry.description : dto.description,
      };
      await this.validateRecord(record, session);
      entry.set(record);
      await entry.save({ session });
      return BudgetEntryResponseDto.from(entry);
    });
  }

  async remove(userId: string, id: string) {
    const entryId = this.objectId(id, 'id'),
      parentId = await this.locate(entryId);
    return this.withParent(userId, parentId, async (session) => {
      const entry = await this.entries.findById(entryId).session(session);
      if (!entry)
        throw new NotFoundException('Budget entry or itinerary day not found');
      await this.dayExists(entry.dayId, parentId, session);
      const result = await this.entries.deleteOne(
        { _id: entryId, dayId: entry.dayId },
        { session },
      );
      if (result.deletedCount !== 1)
        throw new NotFoundException('Budget entry or itinerary day not found');
      return { message: 'Budget entry deleted successfully' };
    });
  }

  private async readOwned<T>(
    userId: string,
    id: string,
    work: (
      session: ClientSession,
      parent: Itinerary & { _id: Types.ObjectId },
    ) => Promise<T>,
  ) {
    const parentId = this.objectId(id, 'itineraryId');
    let session: ClientSession | undefined;
    try {
      session = await this.connection.startSession({
        snapshot: true,
        causalConsistency: false,
      });
      const parent = await this.itineraries
        .findOne({ _id: parentId, userId: new Types.ObjectId(userId) })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (!parent) throw new NotFoundException('Itinerary not found');
      return await work(session, parent);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('code' in error && [50, 239, 246].includes(Number(error.code))) ||
          ('name' in error &&
            [
              'MongoNetworkError',
              'MongoNetworkTimeoutError',
              'MongoServerSelectionError',
            ].includes(String(error.name))))
      )
        throw new ServiceUnavailableException(
          'Consistent budget snapshot unavailable. Please retry.',
        );
      throw error;
    } finally {
      await session?.endSession();
    }
  }

  async list(userId: string, itineraryId: string, day: string) {
    const dayId = this.objectId(day, 'dayId');
    return this.readOwned(userId, itineraryId, async (session, parent) => {
      await this.dayExists(dayId, parent._id, session);
      const entries = await this.entries
        .find({ dayId })
        .sort({ _id: 1 })
        .session(session)
        .read('primary')
        .maxTimeMS(5000);
      return entries.map((entry) => BudgetEntryResponseDto.from(entry));
    });
  }

  async totals(
    userId: string,
    itineraryId: string,
  ): Promise<ItineraryBudgetTotalsResponseDto> {
    return this.readOwned(userId, itineraryId, async (session, parent) => {
      const days = await this.days
        .find({ itineraryId: parent._id })
        .sort({ dayNumber: 1 })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (
        days.length > 60 ||
        days.some((day, index) => day.dayNumber !== index + 1)
      )
        throw new ConflictException(
          'Existing itinerary day numbering is invalid',
        );
      const sources = [
        {
          model: this.entries,
          field: 'amount',
          name: 'budgets',
          category: '$category',
          optional: false,
        },
        {
          model: this.activities,
          field: 'cost',
          name: 'activities',
          category: { $literal: 'ACTIVITIES' },
          optional: true,
        },
        {
          model: this.transports,
          field: 'amount',
          name: 'transports',
          category: { $literal: 'INTERCITY_TRANSPORT' },
          optional: false,
        },
      ];
      const rows = await this.days
        .aggregate<{
          dayId: Types.ObjectId;
          currency: string;
          category: string;
          amount: { toString(): string };
          invalid: number;
          supported: unknown[];
        }>([
          { $match: { itineraryId: parent._id } },
          // Separate source lookups avoid Cartesian multiplication and never create mirror entries.
          ...sources.map(({ model, field, name, category, optional }) => ({
            $lookup: {
              from: model.collection.name,
              let: { day: '$_id' },
              as: name,
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$dayId', '$$day'] },
                    ...(optional ? { [field]: { $ne: null } } : {}),
                  },
                },
                {
                  $project: {
                    currency: 1,
                    category,
                    numeric: { $isNumber: '$' + field },
                    amount: {
                      $convert: {
                        input: {
                          $convert: {
                            input: '$' + field,
                            to: 'string',
                            onError: null,
                            onNull: null,
                          },
                        },
                        to: 'decimal',
                        onError: null,
                        onNull: null,
                      },
                    },
                  },
                },
                {
                  $project: {
                    currency: 1,
                    category: 1,
                    amount: 1,
                    invalid: {
                      $cond: [
                        {
                          $or: [
                            { $not: ['$numeric'] },
                            { $eq: ['$amount', null] },
                            { $lt: ['$amount', 0] },
                            {
                              $in: [
                                { $toString: '$amount' },
                                ['NaN', 'Infinity', '-Infinity'],
                              ],
                            },
                            { $ne: ['$amount', { $round: ['$amount', 2] }] },
                            {
                              $not: [
                                {
                                  $in: [
                                    '$category',
                                    name === 'budgets'
                                      ? Object.values(BudgetCategory)
                                      : ['ACTIVITIES', 'INTERCITY_TRANSPORT'],
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              ],
            },
          })),
          {
            $project: {
              expenses: {
                $concatArrays: sources.map((source) => '$' + source.name),
              },
            },
          },
          { $unwind: '$expenses' },
          {
            $group: {
              _id: {
                dayId: '$_id',
                currency: '$expenses.currency',
                category: '$expenses.category',
              },
              amount: { $sum: '$expenses.amount' },
              invalid: { $max: '$expenses.invalid' },
            },
          },
          {
            $lookup: {
              from: this.currencies.collection.name,
              localField: '_id.currency',
              foreignField: 'code',
              as: 'supported',
            },
          },
          {
            $project: {
              _id: 0,
              dayId: '$_id.dayId',
              currency: '$_id.currency',
              category: '$_id.category',
              amount: 1,
              invalid: 1,
              supported: 1,
            },
          },
        ])
        .session(session)
        .read('primary')
        .option({ maxTimeMS: 5000 });
      // Integer minor units keep every category/day/itinerary sum exact. Fail closed
      // on legacy sub-cent or unsafe magnitudes rather than silently round money.
      const categories = [
        ...Object.values(BudgetCategory),
        'INTERCITY_TRANSPORT',
      ];
      type Bucket = Map<string, Record<string, bigint>>;
      const overall: Bucket = new Map(),
        daily = new Map<string, Bucket>();
      const add = (
        bucket: Bucket,
        currency: string,
        category: string,
        amount: bigint,
      ) => {
        let values = bucket.get(currency);
        if (!values) {
          values = Object.fromEntries(categories.map((key) => [key, 0n]));
          bucket.set(currency, values);
        }
        values[category] += amount;
      };
      for (const row of rows) {
        const text = row.amount?.toString();
        if (
          row.invalid ||
          row.supported.length !== 1 ||
          !/^[A-Z]{3}$/.test(row.currency) ||
          !categories.includes(row.category) ||
          !text ||
          !/^\d+(?:\.\d{1,2})?$/.test(text)
        )
          throw new ConflictException(
            'Existing expenses have invalid amounts, categories or unsupported currencies',
          );
        const [whole, fraction = ''] = text.split('.');
        const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        const key = row.dayId.toString();
        if (!daily.has(key)) daily.set(key, new Map());
        add(daily.get(key)!, row.currency, row.category, cents);
        add(overall, row.currency, row.category, cents);
      }
      const output = (bucket: Bucket): BudgetCurrencyTotalDto[] =>
        [...bucket.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, values]) => {
            const total = Object.values(values).reduce((a, b) => a + b, 0n);
            if (total > BigInt(Number.MAX_SAFE_INTEGER))
              throw new ConflictException(
                'Budget total exceeds safe monetary precision',
              );
            const number = (value: bigint) => {
              const result = Number(value) / 100;
              if (BigInt(result.toFixed(2).replace('.', '')) !== value)
                throw new ConflictException(
                  'Budget total exceeds safe monetary precision',
                );
              return result;
            };
            return {
              currency,
              total: number(total),
              byCategory: {
                FOOD: number(values.FOOD),
                ACCOMMODATION: number(values.ACCOMMODATION),
                IN_CITY_TRANSPORT: number(values.IN_CITY_TRANSPORT),
                ACTIVITIES: number(values.ACTIVITIES),
                INTERCITY_TRANSPORT: number(values.INTERCITY_TRANSPORT),
              },
            };
          });
      return {
        itineraryId: parent._id.toString(),
        totals: output(overall),
        days: days.map((day) => {
          const date = new Date(parent.startDate);
          date.setUTCDate(date.getUTCDate() + day.dayNumber - 1);
          return {
            dayId: day._id.toString(),
            dayNumber: day.dayNumber,
            date: date.toISOString().slice(0, 10),
            totals: output(daily.get(day._id.toString()) ?? new Map()),
          };
        }),
      };
    });
  }
}
