import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { FlightsService } from '../flights/flights.service';
import { SearchFlightsDto } from '../flights/dto/search-flights.dto';
import { Airport, AirportDocument } from '../airports/schemas/airport.schema';
import { airports } from '../reference-data/reference-data.data';
import { City, CityDocument } from '../reference-data/schemas/city.schema';
import { parseCalendarDate } from '../hotel-bookings/utils/calendar-date';
import { paginate, skipFor } from '../common/pagination/pagination';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import {
  ItineraryDay,
  ItineraryDayDocument,
} from './schemas/itinerary-day.schema';
import {
  ItineraryFlightSearchQueryDto,
  ItineraryTripType,
} from './dto/itinerary-flight-search-query.dto';
import { ItineraryFlightSearchResponseDto } from './dto/itinerary-flight-search-response.dto';

@Injectable()
export class ItineraryFlightsService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraries: Model<ItineraryDocument>,
    @InjectModel(ItineraryDay.name)
    private readonly days: Model<ItineraryDayDocument>,
    @InjectModel(City.name) private readonly cities: Model<CityDocument>,
    @InjectModel(Airport.name)
    private readonly airportModel: Model<AirportDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly flights: FlightsService,
  ) {}
  private invalid(field: string, message: string): never {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: { [field]: [message] },
    });
  }
  async search(
    userId: string,
    id: string,
    query: ItineraryFlightSearchQueryDto,
  ): Promise<ItineraryFlightSearchResponseDto> {
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id))
      this.invalid('id', 'Must be a valid MongoDB ID');
    const trip = query.tripType ?? ItineraryTripType.ONE_WAY;
    if (!Object.values(ItineraryTripType).includes(trip))
      this.invalid('tripType', 'Unsupported trip type');
    if (
      trip === ItineraryTripType.ONE_WAY &&
      (query.returnDate !== undefined || query.returnPage !== undefined)
    )
      this.invalid('tripType', 'returnDate and returnPage require ROUND_TRIP');
    const definitions = new Map(
      airports.map((airport) => [airport.iata_code, airport]),
    );
    if (
      typeof query.departureAirport !== 'string' ||
      !definitions.has(query.departureAirport)
    )
      this.invalid(
        'departureAirport',
        'Select an airport from the predefined list',
      );
    for (const field of ['departureDate', 'returnDate'] as const)
      if (query[field] !== undefined && !parseCalendarDate(query[field]))
        this.invalid(
          field,
          'Must be a real calendar date in YYYY-MM-DD format',
        );
    let session: ClientSession | undefined;
    let search: Omit<SearchFlightsDto, 'arrivalAirport'>,
      destinations: string[];
    try {
      session = await this.connection.startSession({
        snapshot: true,
        causalConsistency: false,
      });
      const parent = await this.itineraries
        .findOne({
          _id: new Types.ObjectId(id),
          userId: new Types.ObjectId(userId),
        })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (!parent) throw new NotFoundException('Itinerary not found');
      const days = await this.days
        .find({ itineraryId: parent._id })
        .select('_id dayNumber cityId')
        .sort({ dayNumber: 1 })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (!days.length) throw new NotFoundException('Itinerary has no days');
      if (
        days.length > 60 ||
        days.some(
          (day, index) =>
            day.dayNumber !== index + 1 ||
            typeof day.cityId !== 'string' ||
            !day.cityId.trim() ||
            day.cityId !== day.cityId.trim(),
        )
      )
        throw new ConflictException(
          'Existing itinerary day numbering or city is invalid',
        );
      const city = await this.cities
        .findOne({ cityId: days[0].cityId })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (
        !city ||
        typeof city.name !== 'string' ||
        !city.name.trim() ||
        !/^[A-Z]{2}$/.test(city.countryCode)
      )
        throw new ConflictException(
          'First itinerary day has an invalid city reference',
        );
      const candidates = airports
        .filter((airport) => airport.city_id === city.cityId)
        .map((airport) => airport.iata_code);
      const records = await this.airportModel
        .find({
          iataCode: {
            $in: [...new Set([query.departureAirport, ...candidates])],
          },
        })
        .select('_id iataCode name city country timezone')
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      const origin = records.find(
        (airport) => airport.iataCode === query.departureAirport,
      );
      if (!origin)
        this.invalid(
          'departureAirport',
          'Select an airport from the predefined list',
        );
      for (const airport of records) {
        const expected = definitions.get(airport.iataCode);
        if (
          !expected ||
          airport.city !== expected.city_id ||
          airport.country !== expected.country_code ||
          airport.timezone !== expected.time_zone
        )
          throw new ConflictException(
            'Existing airport reference mapping is invalid',
          );
        try {
          new Intl.DateTimeFormat('en', { timeZone: airport.timezone });
        } catch {
          throw new ConflictException('Existing airport timezone is invalid');
        }
      }
      destinations = records
        .filter(
          (airport) =>
            airport.city === city.cityId &&
            airport.country === city.countryCode &&
            airport.iataCode !== query.departureAirport,
        )
        .map((airport) => airport.iataCode)
        .sort();
      const start =
        parent.startDate instanceof Date ? parent.startDate : new Date(NaN);
      if (!Number.isFinite(start.getTime()))
        throw new ConflictException('Existing itinerary date is invalid');
      const last = new Date(start);
      last.setUTCDate(last.getUTCDate() + days.length - 1);
      const calendar = (date: Date) => {
        if (!Number.isFinite(date.getTime()))
          throw new ConflictException('Existing itinerary date is invalid');
        const text = date.toISOString().slice(0, 10);
        if (!parseCalendarDate(text))
          throw new ConflictException(
            'Existing itinerary date is outside the supported calendar',
          );
        return text;
      };
      const departureDate = query.departureDate ?? calendar(start);
      const returnDate =
        trip === ItineraryTripType.ROUND_TRIP
          ? (query.returnDate ?? calendar(last))
          : undefined;
      if (returnDate && returnDate < departureDate)
        this.invalid(
          'returnDate',
          'Return date cannot be before departure date',
        );
      search = {
        departureAirport: query.departureAirport,
        departureDate,
        ...(returnDate === undefined ? {} : { returnDate }),
        adults: query.adults,
        children: query.children ?? 0,
        infants: query.infants ?? 0,
        cabinClass: query.cabinClass,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      };
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
          'Consistent itinerary snapshot unavailable. Please retry.',
        );
      throw error;
    } finally {
      await session?.endSession();
    }
    // Shared FLT-11/12 availability, pricing and global sorting; paginate only once.
    const result = await this.flights.searchToAirports(search, destinations);
    const page = (items: Record<string, unknown>[], number: number) =>
      paginate(
        items.slice(skipFor(number), skipFor(number) + 10),
        items.length,
        number,
      );
    return {
      outbound: page(result.outbound, query.outboundPage ?? 1),
      ...(result.return === undefined
        ? {}
        : { return: page(result.return, query.returnPage ?? 1) }),
    };
  }
}
