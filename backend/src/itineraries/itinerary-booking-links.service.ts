import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { BookingType } from '../payments/enums/payment.enums';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Flight } from '../flights/schemas/flight.schema';
import { Airport } from '../airports/schemas/airport.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { City } from '../reference-data/schemas/city.schema';
import { Currency } from '../reference-data/schemas/currency.schema';
import { paginate, skipFor } from '../common/pagination/pagination';
import { Itinerary } from './schemas/itinerary.schema';
import { ItineraryDay } from './schemas/itinerary-day.schema';
import {
  ItineraryBookingLink,
  ItineraryBookingLinkDocument,
} from './schemas/itinerary-booking-link.schema';
import { CreateItineraryBookingLinkDto } from './dto/create-itinerary-booking-link.dto';
import { ItineraryBookingLinkResponseDto } from './dto/itinerary-booking-link-response.dto';
import { allocateBooking } from './utils/booking-budget-allocations';

@Injectable()
export class ItineraryBookingLinksService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraries: Model<Itinerary>,
    @InjectModel(ItineraryDay.name) private readonly days: Model<ItineraryDay>,
    @InjectModel(ItineraryBookingLink.name)
    private readonly links: Model<ItineraryBookingLinkDocument>,
    @InjectModel(FlightBooking.name)
    private readonly flightBookings: Model<FlightBooking>,
    @InjectModel(HotelBooking.name)
    private readonly hotelBookings: Model<HotelBooking>,
    @InjectModel(Flight.name) private readonly flights: Model<Flight>,
    @InjectModel(Airport.name) private readonly airports: Model<Airport>,
    @InjectModel(Hotel.name) private readonly hotels: Model<Hotel>,
    @InjectModel(City.name) private readonly cities: Model<City>,
    @InjectModel(Currency.name) private readonly currencies: Model<Currency>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  private objectId(value: string, field: string) {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value))
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { [field]: ['Must be a valid MongoDB ID'] },
      });
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
        if (!parent) throw new NotFoundException('Itinerary not found');
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

  private async context(
    id: Types.ObjectId,
    session: ClientSession,
    userId?: string,
  ) {
    const parent = await this.itineraries
      .findOne({
        _id: id,
        ...(userId ? { userId: new Types.ObjectId(userId) } : {}),
      })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    if (!parent) throw new NotFoundException('Itinerary not found');
    const days = await this.days
      .find({ itineraryId: id })
      .sort({ dayNumber: 1 })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    if (
      days.length > 60 ||
      days.some(
        (day, index) =>
          day.dayNumber !== index + 1 ||
          typeof day.cityId !== 'string' ||
          !day.cityId.trim(),
      )
    )
      throw new ConflictException('Invalid itinerary day sequence');
    return { parent, days };
  }
  private async readLinks(id: Types.ObjectId, session: ClientSession) {
    return this.links
      .find({ itineraryId: id })
      .sort({ _id: 1 })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
  }
  private async views(
    parent: any,
    days: any[],
    links: any[],
    session: ClientSession,
  ): Promise<ItineraryBookingLinkResponseDto[]> {
    if (!links.length) return [];
    const owned = { user: parent.userId };
    const validIds = (values: unknown[]): Types.ObjectId[] =>
      values
        .filter(
          (value) =>
            !Array.isArray(value) && Types.ObjectId.isValid(value as string),
        )
        .map((value) => new Types.ObjectId(String(value)));
    // Batch every source and related reference in the SAME snapshot. No lifecycle
    // module import, service callback, copied budget entry or financial write.
    const flightBookings = await this.flightBookings
      .find({
        ...owned,
        _id: {
          $in: validIds(
            links
              .filter((l) => l.bookingType === 'flight')
              .map((l) => l.bookingId),
          ),
        },
      })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    const hotelBookings = await this.hotelBookings
      .find({
        ...owned,
        _id: {
          $in: validIds(
            links
              .filter((l) => l.bookingType === 'hotel')
              .map((l) => l.bookingId),
          ),
        },
      })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    const flights = await this.flights
      .find({
        _id: {
          $in: validIds(
            flightBookings.flatMap((b) =>
              [b.outboundFlight, b.returnFlight].filter(Boolean),
            ),
          ),
        },
      })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    const airports = await this.airports
      .find({
        _id: {
          $in: validIds(
            flights.flatMap((f) => [f.departureAirport, f.arrivalAirport]),
          ),
        },
      })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    const hotels = await this.hotels
      .find({ _id: { $in: validIds(hotelBookings.map((b) => b.hotel)) } })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    const cities = await this.cities
      .find({
        $or: [
          {
            cityId: {
              $in: [
                ...days.map((d) => d.cityId),
                ...airports.map((a) => a.city),
              ],
            },
          },
          { _id: { $in: validIds(hotels.map((h) => h.city)) } },
        ],
      })
      .session(session)
      .read('primary')
      .maxTimeMS(5000)
      .lean();
    const cityMap = new Map<string, any>();
    for (const city of cities) {
      cityMap.set(city.cityId, city);
      cityMap.set(String(city._id), city);
    }
    const bookings = new Map<string, any>([
      ...flightBookings.map((b) => ['flight:' + String(b._id), b] as const),
      ...hotelBookings.map((b) => ['hotel:' + String(b._id), b] as const),
    ]);
    const supported = await this.currencies
      .exists({ code: 'USD' })
      .session(session);
    return links.map((link) => {
      const view: ItineraryBookingLinkResponseDto = {
        id: String(link._id),
        itineraryId: String(link.itineraryId),
        bookingType: link.bookingType,
        bookingId: String(link.bookingId),
        dayIds: Array.isArray(link.dayIds) ? link.dayIds.map(String) : [],
        bookingReference: null,
        bookingStatus: null,
        state: 'INACCESSIBLE',
        reason: 'BOOKING_UNAVAILABLE',
        currency: null,
        bookingAmount: null,
        allocations: [],
      };
      const booking: any = bookings.get(
        link.bookingType + ':' + String(link.bookingId),
      );
      if (!booking) return view; // Never expose another owner's financial data.
      view.state = 'INACTIVE';
      view.bookingReference = booking.bookingReference ?? null;
      view.bookingStatus = booking.status;
      if (!['CONFIRMED', 'COMPLETED'].includes(booking.status)) {
        view.reason = 'BOOKING_INELIGIBLE';
        return view;
      }
      if (!booking.bookingReference) {
        view.reason = 'BOOKING_NOT_FINALIZED';
        return view;
      }
      try {
        if (!supported) throw new Error('Unsupported booking currency');
        const result = allocateBooking({
          type: link.bookingType,
          booking,
          days,
          selected: view.dayIds,
          startDate: parent.startDate,
          flights: new Map(flights.map((f) => [String(f._id), f])),
          airports: new Map(airports.map((a) => [String(a._id), a])),
          hotels: new Map(hotels.map((h) => [String(h._id), h])),
          cities: cityMap,
        });
        view.state = 'ACTIVE';
        view.reason = null;
        view.currency = booking.currency;
        view.bookingAmount = result.amount;
        view.allocations = result.allocations;
      } catch (error) {
        view.reason =
          error instanceof Error ? error.message : 'ASSOCIATION_INCOMPATIBLE';
      }
      return view;
    });
  }
  async create(userId: string, id: string, dto: CreateItineraryBookingLinkDto) {
    const parentId = this.objectId(id, 'id'),
      bookingId = this.objectId(dto.bookingId, 'bookingId');
    if (
      !Object.values(BookingType).includes(dto.bookingType) ||
      !Array.isArray(dto.dayIds) ||
      dto.dayIds.length < 1 ||
      dto.dayIds.length > 60 ||
      new Set(dto.dayIds).size !== dto.dayIds.length
    )
      throw new BadRequestException(
        'Select a supported booking type and distinct itinerary days',
      );
    const dayIds = dto.dayIds.map((day) => this.objectId(day, 'dayIds'));
    if (new Set(dayIds.map(String)).size !== dayIds.length)
      throw new BadRequestException('Select distinct itinerary days');
    try {
      return await this.withParent(userId, parentId, async (session) => {
        const { parent, days } = await this.context(parentId, session, userId);
        if (dayIds.some((id) => !days.some((day) => day._id.equals(id))))
          throw new NotFoundException('Itinerary day not found');
        const link = {
          _id: new Types.ObjectId(),
          itineraryId: parentId,
          bookingType: dto.bookingType,
          bookingId,
          dayIds: days
            .filter((day) => dayIds.some((id) => day._id.equals(id)))
            .map((day) => day._id),
        };
        const [view] = await this.views(parent, days, [link], session);
        if (view.state === 'INACCESSIBLE')
          throw new NotFoundException('Booking not found');
        if (view.state !== 'ACTIVE')
          throw new ConflictException(
            view.reason ?? 'Booking cannot be linked',
          );
        await this.links.create([link], { session });
        return view;
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      )
        throw new ConflictException(
          'Booking is already linked; unlink it first',
        );
      throw error;
    }
  }
  private async snapshot<T>(
    userId: string,
    id: string,
    work: (session: ClientSession, id: Types.ObjectId) => Promise<T>,
  ) {
    const parentId = this.objectId(id, 'id');
    let session: ClientSession | undefined;
    try {
      session = await this.connection.startSession({
        snapshot: true,
        causalConsistency: false,
      });
      return await work(session, parentId);
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
          'Consistent booking-link snapshot unavailable',
        );
      throw error;
    } finally {
      await session?.endSession();
    }
  }
  async list(userId: string, id: string, page = 1) {
    return this.snapshot(userId, id, async (session, parentId) => {
      const { parent, days } = await this.context(parentId, session, userId),
        links = await this.readLinks(parentId, session);
      const views = await this.views(parent, days, links, session);
      return paginate(
        views.slice(skipFor(page), skipFor(page) + 10),
        views.length,
        page,
      );
    });
  }
  async remove(userId: string, id: string, linkId: string) {
    const parentId = this.objectId(id, 'id'),
      selected = this.objectId(linkId, 'linkId');
    return this.withParent(userId, parentId, async (session) => {
      const result = await this.links.deleteOne(
        { _id: selected, itineraryId: parentId },
        { session },
      );
      if (result.deletedCount !== 1)
        throw new NotFoundException('Booking link not found');
      return { message: 'Booking link removed successfully' };
    });
  }
  async removeForDays(dayIds: Types.ObjectId[], session: ClientSession) {
    await this.links.deleteMany({ dayIds: { $in: dayIds } }, { session });
  }
  // Called only after the reporting endpoint has enforced parent ownership.
  // With no links, mandatory reports incur just one empty association read.
  async contributions(itineraryId: Types.ObjectId, session: ClientSession) {
    const links = await this.readLinks(itineraryId, session);
    if (!links.length) return [];
    const { parent, days } = await this.context(itineraryId, session);
    const views = await this.views(parent, days, links, session);
    return views
      .filter((view) => view.state === 'ACTIVE')
      .flatMap((view) =>
        view.allocations.map((allocation) => ({
          ...allocation,
          dayId: new Types.ObjectId(allocation.dayId),
          currency: view.currency!,
        })),
      );
  }
  async removeForItinerary(
    itineraryId: Types.ObjectId,
    session: ClientSession,
  ) {
    await this.links.deleteMany({ itineraryId }, { session });
  }
  async aggregationExpenses(
    itineraryId: Types.ObjectId,
    session: ClientSession,
  ) {
    const allocations = await this.contributions(itineraryId, session);
    const rows = allocations.map((a) => ({
      dayId: a.dayId,
      category: a.category,
      currency: a.currency,
      amount: Types.Decimal128.fromString(String(a.amount)),
    }));
    return {
      $map: {
        input: {
          $filter: {
            input: { $literal: rows },
            as: 'linked',
            cond: { $eq: ['$$linked.dayId', '$_id'] },
          },
        },
        as: 'linked',
        in: {
          category: '$$linked.category',
          currency: '$$linked.currency',
          amount: '$$linked.amount',
          invalid: { $literal: 0 },
        },
      },
    };
  }
}
