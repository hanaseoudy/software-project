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
  IntercityTransportMode,
  TransportCost,
  TransportCostDocument,
} from './schemas/transport-cost.schema';
import { City, CityDocument } from '../reference-data/schemas/city.schema';
import {
  Currency,
  CurrencyDocument,
} from '../reference-data/schemas/currency.schema';
import { CreateTransportCostDto } from './dto/create-transport-cost.dto';
import { UpdateTransportCostDto } from './dto/update-transport-cost.dto';
import { TransportCostResponseDto } from './dto/transport-cost-response.dto';

@Injectable()
export class TransportCostsService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraries: Model<ItineraryDocument>,
    @InjectModel(ItineraryDay.name)
    private readonly days: Model<ItineraryDayDocument>,
    @InjectModel(TransportCost.name)
    private readonly costs: Model<TransportCostDocument>,
    @InjectModel(City.name) private readonly cities: Model<CityDocument>,
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
            'Transport cost or itinerary day not found',
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
      throw new NotFoundException('Transport cost or itinerary day not found');
    }
  }

  private async validateRecord(record: TransportCost, session: ClientSession) {
    if (!Object.values(IntercityTransportMode).includes(record.mode))
      this.invalid('mode', 'Unsupported transport mode');
    if (
      !isNumber(record.amount, {
        maxDecimalPlaces: 2,
        allowNaN: false,
        allowInfinity: false,
      }) ||
      record.amount < 0
    ) {
      this.invalid(
        'amount',
        'Must be a finite nonnegative number with at most two decimal places',
      );
    }
    for (const field of ['fromCityId', 'toCityId'] as const) {
      const cityId = record[field];
      if (
        typeof cityId !== 'string' ||
        !cityId.trim() ||
        !(await this.cities.exists({ cityId }).session(session))
      ) {
        this.invalid(field, 'Must be a supported GEN-12 cityId');
      }
    }
    if (
      typeof record.currency !== 'string' ||
      !(await this.currencies
        .exists({ code: record.currency })
        .session(session))
    ) {
      this.invalid('currency', 'Must be a supported GEN-12 currency');
    }
    // No distinct-city, adjacency or day-city business restriction is specified.
  }

  async create(
    userId: string,
    itineraryId: string,
    dto: CreateTransportCostDto,
  ) {
    const parentId = this.objectId(itineraryId, 'itineraryId');
    const dayId = this.objectId(dto.dayId, 'dayId');
    return this.withParent(userId, parentId, async (session) => {
      await this.dayExists(dayId, parentId, session);
      const record: TransportCost = {
        dayId,
        mode: dto.mode,
        fromCityId: dto.fromCityId,
        toCityId: dto.toCityId,
        amount: dto.amount,
        currency: dto.currency,
      };
      await this.validateRecord(record, session);
      const [entry] = await this.costs.create([record], { session });
      return TransportCostResponseDto.from(entry);
    });
  }

  private async locate(entryId: Types.ObjectId): Promise<Types.ObjectId> {
    // Discovery only. Never authorize a mutation from these potentially stale reads.
    const entry = await this.costs.findById(entryId).select('dayId').lean();
    if (!entry)
      throw new NotFoundException('Transport cost or itinerary day not found');
    const day = await this.days
      .findById(entry.dayId)
      .select('itineraryId')
      .lean();
    if (!day)
      throw new NotFoundException('Transport cost or itinerary day not found');
    return day.itineraryId;
  }

  async update(userId: string, id: string, dto: UpdateTransportCostDto) {
    const entryId = this.objectId(id, 'id');
    if (
      ![
        dto.dayId,
        dto.mode,
        dto.fromCityId,
        dto.toCityId,
        dto.amount,
        dto.currency,
      ].some((value) => value !== undefined)
    ) {
      this.invalid(
        'body',
        'Provide at least one editable transport-cost field',
      );
    }
    const targetDayId =
      dto.dayId === undefined ? undefined : this.objectId(dto.dayId, 'dayId');
    const parentId = await this.locate(entryId);
    return this.withParent(userId, parentId, async (session) => {
      const entry = await this.costs.findById(entryId).session(session);
      if (!entry)
        throw new NotFoundException(
          'Transport cost or itinerary day not found',
        );
      await this.dayExists(entry.dayId, parentId, session);
      const record: TransportCost = {
        dayId: targetDayId ?? entry.dayId,
        mode: dto.mode === undefined ? entry.mode : dto.mode,
        fromCityId:
          dto.fromCityId === undefined ? entry.fromCityId : dto.fromCityId,
        toCityId: dto.toCityId === undefined ? entry.toCityId : dto.toCityId,
        amount: dto.amount === undefined ? entry.amount : dto.amount,
        currency: dto.currency === undefined ? entry.currency : dto.currency,
      };
      // One parent, one transaction: reassignment cannot cross itineraries.
      if (targetDayId) await this.dayExists(targetDayId, parentId, session);
      await this.validateRecord(record, session);
      entry.set(record);
      await entry.save({ session });
      return TransportCostResponseDto.from(entry);
    });
  }

  async remove(userId: string, id: string) {
    const entryId = this.objectId(id, 'id');
    const parentId = await this.locate(entryId);
    return this.withParent(userId, parentId, async (session) => {
      const entry = await this.costs.findById(entryId).session(session);
      if (!entry)
        throw new NotFoundException(
          'Transport cost or itinerary day not found',
        );
      await this.dayExists(entry.dayId, parentId, session);
      const result = await this.costs.deleteOne(
        { _id: entryId, dayId: entry.dayId },
        { session },
      );
      if (result.deletedCount !== 1)
        throw new NotFoundException(
          'Transport cost or itinerary day not found',
        );
      return { message: 'Transport cost deleted successfully' };
    });
  }
}
