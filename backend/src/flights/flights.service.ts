// flights.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { fromZonedTime } from 'date-fns-tz';
import { Flight, FlightDocument, FlightStatus } from './schemas/flight.schema';
import { Airport, AirportDocument } from '../airports/schemas/airport.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { CreateFlightsDto } from './dto/create-flights.dto';
import { formatFlightWithLocalTimes } from './utils/flight-time.formatter';
import { AddCabinDto } from './dto/add-cabin.dto';
import { isValidObjectId } from 'mongoose';
import {
  SearchFlightsDto,
  FlightSortBy,
  SortFlightOrder,
} from './dto/search-flights.dto';
import {
  Airline,
  AirlineDocument,
  CabinClass,
} from '../airlines/schemas/airline.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  FlightBooking,
  FlightBookingStatus,
} from '../flight-bookings/schemas/flight-booking.schema';

@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);

  constructor(
    @InjectModel(Flight.name)
    private readonly flightsModel: Model<FlightDocument>,
    @InjectModel(Airport.name)
    private readonly airportModel: Model<AirportDocument>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignmentDocument>,
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
    @InjectModel(FlightBooking.name)
    private readonly flightBookingsModel: Model<FlightBooking>,
  ) {}

  async create(moderatorId: string, dto: CreateFlightsDto) {
    const airlineId = await this.getModeratorAirlineId(moderatorId);
    const { departureAirport, arrivalAirport } = await this.getAirports(
      dto.departureAirport,
      dto.arrivalAirport,
    );

    this.assertRealLocalDateTime(dto.departureTime, 'departureTime');
    this.assertRealLocalDateTime(dto.arrivalTime, 'arrivalTime');

    const departureUtc = fromZonedTime(
      dto.departureTime,
      departureAirport.timezone,
    );
    const arrivalUtc = fromZonedTime(dto.arrivalTime, arrivalAirport.timezone);

    this.validateFlightSchedule(
      dto.departureAirport,
      dto.arrivalAirport,
      departureUtc,
      arrivalUtc,
    );

    const departureLocalDate = dto.departureTime.split('T')[0]; // or via date-fns-tz

    await this.ensureNoDuplicateFlight(
      airlineId,
      dto.flightNumber,
      departureLocalDate,
    );

    let flight: FlightDocument;
    try {
      flight = await this.flightsModel.create({
        airline: airlineId,
        flightNumber: dto.flightNumber,
        departureAirport: departureAirport._id,
        arrivalAirport: arrivalAirport._id,
        departureTime: departureUtc,
        arrivalTime: arrivalUtc,
        departureLocalDate,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          'A flight with this number already exists on this date',
        );
      }
      throw err;
    }

    // Populate the references before returning the response
    const populatedFlight = await flight.populate([
      'airline',
      'departureAirport',
      'arrivalAirport',
    ]);

    return formatFlightWithLocalTimes(populatedFlight);
  }
  /**
   * FLT-30: Automatically transitions Scheduled flights to Departed
   * once their departureTime (UTC) has passed.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async markDepartedFlights(): Promise<void> {
    const now = new Date();
    const result = await this.flightsModel.updateMany(
      {
        status: FlightStatus.SCHEDULED,
        departureTime: { $lte: now },
      },
      {
        $set: { status: FlightStatus.DEPARTED },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Transitioned ${result.modifiedCount} flight(s) from SCHEDULED to DEPARTED`,
      );
    }
  }

  /**
   * FLT-30: Ensures a flight is currently Scheduled and has not passed its departure time.
   * Also lazily syncs the DB status if departureTime just passed before the next cron tick.
   */

  async assertFlightScheduled(flight: FlightDocument): Promise<void> {
    if (flight.status === FlightStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify or book a cancelled flight');
    }

    if (
      flight.status === FlightStatus.DEPARTED ||
      new Date(flight.departureTime) <= new Date()
    ) {
      if (flight.status === FlightStatus.SCHEDULED) {
        flight.status = FlightStatus.DEPARTED;
        await flight.save();
      }
      throw new BadRequestException('Cannot modify or book a departed flight');
    }
  }

  async addCabin(flightId: string, userId: string, dto: AddCabinDto) {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException('Invalid flight ID format');
    }
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const flight = await this.flightsModel.findById(flightId);
    if (!flight) {
      throw new NotFoundException('Flight not found');
    }

    // 3. Security: Check if this moderator owns the airline that owns this flight
    const moderatorAirlineId = await this.getModeratorAirlineId(userId);
    if (flight.airline.toString() !== moderatorAirlineId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to modify cabins for this flight',
      );
    }

    await this.assertFlightScheduled(flight);

    // 4. Rule: Each cabin category used at most once per flight
    const cabinExists = flight.cabins.some(
      (c) => c.cabinClass === dto.cabinClass,
    );
    if (cabinExists) {
      throw new ConflictException(
        `Cabin class ${dto.cabinClass} already exists on this flight`,
      );
    }

    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new ConflictException(
        'Cabins can only be added to Scheduled flights',
      );
    }

    const updated = await this.flightsModel.findOneAndUpdate(
      { _id: flightId, 'cabins.cabinClass': { $ne: dto.cabinClass } },
      { $push: { cabins: { ...dto, bookedSeats: 0, heldSeats: 0 } } },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new ConflictException(
        'Cabin could not be added: it may already exist or the flight changed. Please retry.',
      );
    }

    return formatFlightWithLocalTimes(
      await updated.populate(['airline', 'departureAirport', 'arrivalAirport']),
    );
  }

  // constructor: inject the Airline model next to the Flight model

  async search(dto: SearchFlightsDto) {
    return this.searchRoutes(dto);
  }

  // ITN-26: all destination airports participate in each leg's single query.
  // Legacy search keeps its original unpaginated, single-airport contract.
  async searchToAirports(dto: Omit<SearchFlightsDto, 'arrivalAirport'>, arrivalCodes: readonly string[]) {
    const codes = [...new Set(arrivalCodes)].filter(code => code !== dto.departureAirport);
    const result = await this.searchRoutes({ ...dto, arrivalAirport: codes[0] ?? '' }, codes);
    const unique = (flights: any[]) => {
      const byId = new Map<string, any>();
      for (const flight of flights) {
        const id = flight._id?.toString();
        if (!id || !isValidObjectId(id)) throw new ServiceUnavailableException('Flight search returned an invalid identifier');
        if (!byId.has(id)) byId.set(id, flight);
      }
      return [...byId.values()];
    };
    return { outbound: unique(result.outbound), ...(result.return === undefined ? {} : { return: unique(result.return) }) };
  }

  private async searchRoutes(dto: SearchFlightsDto, arrivalCodes?: readonly string[]) {
    const { adults, children = 0, infants = 0 } = dto;

    if (infants > adults) {
      throw new BadRequestException('Infants cannot outnumber adults');
    }
    if (dto.returnDate && dto.returnDate < dto.departureDate) {
      throw new BadRequestException('returnDate cannot be before departDate');
    }

    if (
      dto.minPrice !== undefined &&
      dto.maxPrice !== undefined &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }

    const seatsNeeded = adults + children; // infants occupy no seat
    const party = { adults, children, infants };

    const priceRange = { minPrice: dto.minPrice, maxPrice: dto.maxPrice };

    const outboundRaw = await this.findLeg(
      dto.departureAirport,
      arrivalCodes ?? dto.arrivalAirport,
      dto.departureDate,
      seatsNeeded,
      party,
      dto.cabinClass,
      priceRange,
    );
    const outbound = this.sortFlights(outboundRaw, dto.sortBy, dto.sortOrder, arrivalCodes !== undefined); // ADDED (FLT-15)

    if (!dto.returnDate) return { outbound };

    const returningRaw = await this.findLeg(
      arrivalCodes ?? dto.arrivalAirport,
      dto.departureAirport,
      dto.returnDate,
      seatsNeeded,
      party,
      dto.cabinClass,
      priceRange,
    );

    const returning = this.sortFlights(returningRaw, dto.sortBy, dto.sortOrder, arrivalCodes !== undefined); // ADDED (FLT-15)

    return { outbound, return: returning };
  }

  async findOne(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid flight ID format');
    }

    const flight = await this.flightsModel
      .findById(id)
      .populate('airline')
      .populate('departureAirport')
      .populate('arrivalAirport')
      .lean();

    if (!flight) {
      throw new NotFoundException('Flight not found');
    }

    const formatted = formatFlightWithLocalTimes(flight);

    return {
      ...formatted,
      cabins: (formatted.cabins ?? []).map((c: any) => ({
        cabinId: c._id,
        cabinClass: c.cabinClass,
        totalSeats: c.totalSeats,
        seatsRemaining: c.totalSeats - c.bookedSeats - c.heldSeats,
        price: c.price,
        currency: c.currency,
        freeBags: c.freeBags,
        maxBagWeightKg: c.maxBagWeightKg,
      })),
      cancellationPolicy: (formatted.airline as any)?.cancellationPolicy ?? {
        rules: [],
      },
    };
  }

  async getModeratorFlightBookings(flightId: string, moderatorId: string) {
    const flight = await this.loadModeratorFlight(flightId, moderatorId);
    const bookings = await this.findModeratorFlightBookings(flightId);

    return {
      flightId: String(flight._id),
      flightNumber: flight.flightNumber,
      cabinsRemaining: flight.cabins.map((cabin) => ({
        cabinClass: cabin.cabinClass,
        seatsRemaining: Math.max(
          0,
          cabin.totalSeats - cabin.bookedSeats - cabin.heldSeats,
        ),
      })),
      bookings: bookings.map((booking) => ({
        bookingReference: booking.bookingReference ?? null,
        cabinClass: booking.cabinClass,
        status: booking.status,
        passengers: booking.passengers.map((passenger) => ({
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          seatNumber: passenger.seatNumber ?? null,
        })),
      })),
    };
  }

  async getModeratorPassengerCsv(flightId: string, moderatorId: string) {
    const report = await this.getModeratorFlightBookings(flightId, moderatorId);
    const escapeCsv = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows: unknown[][] = [
      ['Booking Reference', 'Passenger Name', 'Cabin', 'Seat', 'Status'],
      ...report.bookings.flatMap((booking) =>
        booking.passengers.map((passenger) => [
          booking.bookingReference,
          `${passenger.firstName} ${passenger.lastName}`,
          booking.cabinClass,
          passenger.seatNumber,
          booking.status,
        ]),
      ),
    ];

    return rows
      .map((row) =>
        row.map((value: unknown) => escapeCsv(value)).join(','),
      )
      .join('\r\n');
  }

  private async loadModeratorFlight(
    flightId: string,
    moderatorId: string,
  ): Promise<FlightDocument> {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException('Invalid flight ID format');
    }
    if (!isValidObjectId(moderatorId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const flight = await this.flightsModel.findById(flightId).lean();
    if (!flight) {
      throw new NotFoundException('Flight not found');
    }

    const airlineId = await this.getModeratorAirlineId(moderatorId);
    if (flight.airline.toString() !== airlineId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to view this flight',
      );
    }

    return flight as unknown as FlightDocument;
  }

  private async findModeratorFlightBookings(flightId: string) {
    const flightObjectId = new Types.ObjectId(flightId);
    return this.flightBookingsModel
      .find({
        $or: [
          { outboundFlight: flightObjectId },
          { returnFlight: flightObjectId },
        ],
        status: {
          $in: [
            FlightBookingStatus.CONFIRMED,
            FlightBookingStatus.CANCELLED,
          ],
        },
      })
      .sort({ bookingReference: 1 })
      .lean();
  }

  private async findLeg(
    fromCode: string | readonly string[],
    toCode: string | readonly string[],
    localDate: string,
    seatsNeeded: number,
    party: { adults: number; children: number; infants: number },
    cabinClass?: CabinClass,
    priceRange?: { minPrice?: number; maxPrice?: number },
  ) {
    let departure: Types.ObjectId | { $in: Types.ObjectId[] }, arrival: Types.ObjectId | { $in: Types.ObjectId[] };
    if (typeof fromCode === 'string' && typeof toCode === 'string') {
      // Preserve legacy lookup/validation semantics exactly.
      const [from, to] = await Promise.all([
        this.airportModel.findOne({ iataCode: fromCode }),
        this.airportModel.findOne({ iataCode: toCode }),
      ]);
      if (!from || !to) throw new BadRequestException('Unknown airport code');
      departure = from._id; arrival = to._id;
    } else {
      const fromCodes = typeof fromCode === 'string' ? [fromCode] : [...fromCode];
      const toCodes = typeof toCode === 'string' ? [toCode] : [...toCode];
      if (!fromCodes.length || !toCodes.length) return [];
      const allCodes = [...new Set([...fromCodes, ...toCodes])];
      const airports = await this.airportModel.find({ iataCode: { $in: allCodes } }).lean();
      const byCode = new Map(airports.map(airport => [airport.iataCode, airport._id]));
      if (allCodes.some(code => !byCode.has(code))) throw new BadRequestException('Unknown airport code');
      departure = { $in: fromCodes.map(code => byCode.get(code)!) };
      arrival = { $in: toCodes.map(code => byCode.get(code)!) };
    }
    const flights = await this.flightsModel
      .find({
        departureAirport: departure,
        arrivalAirport: arrival,
        departureLocalDate: localDate,
        status: FlightStatus.SCHEDULED,
        departureTime: { $gt: new Date() },
      })
      .populate('airline')
      .populate('departureAirport')
      .populate('arrivalAirport')
      .lean();

    return flights
      .filter((f: any) => f.airline && f.airline.isActive !== false)
      .map((f: any) =>
        formatFlightWithLocalTimes({
          ...f,
          cabins: f.cabins
            .filter((c: any) => !cabinClass || c.cabinClass === cabinClass)
            .filter(
              (c: any) =>
                (priceRange?.minPrice === undefined ||
                  c.price >= priceRange.minPrice) &&
                (priceRange?.maxPrice === undefined ||
                  c.price <= priceRange.maxPrice),
            )
            .map((c: any) => ({
              cabinId: c._id,
              cabinClass: c.cabinClass,
              seatsRemaining: c.totalSeats - c.bookedSeats - c.heldSeats,
              fare: c.price,
              totalPrice: this.tripPrice(c.price, party),
            }))
            .filter((c: any) => c.seatsRemaining >= seatsNeeded),
        }),
      )
      .filter((f: any) => f.cabins.length > 0);
  }

  private tripPrice(
    fare: number,
    p: { adults: number; children: number; infants: number },
  ) {
    const cents = Math.round(fare * 100);
    const infantCents = Math.round(cents * 0.1);
    return (cents * (p.adults + p.children) + infantCents * p.infants) / 100;
  }

  private sortFlights(
    flights: any[],
    sortBy: FlightSortBy = FlightSortBy.DEPARTURE_TIME,
    sortOrder: SortFlightOrder = SortFlightOrder.ASC,
    stableTies = false,
  ) {
    const dir = sortOrder === SortFlightOrder.DESC ? -1 : 1;

    return [...flights].sort((a, b) => {
      let diff = 0;

      if (sortBy === FlightSortBy.PRICE) {
        const minA = Math.min(...a.cabins.map((c: any) => c.fare));
        const minB = Math.min(...b.cabins.map((c: any) => c.fare));
        diff = minA - minB;
      } else if (sortBy === FlightSortBy.DURATION) {
        const durA =
          a.durationMinutes ??
          new Date(a.arrivalTime).getTime() -
            new Date(a.departureTime).getTime();
        const durB =
          b.durationMinutes ??
          new Date(b.arrivalTime).getTime() -
            new Date(b.departureTime).getTime();
        diff = durA - durB;
      } else {
        diff =
          new Date(a.departureTime).getTime() -
          new Date(b.departureTime).getTime();
      }

      return diff * dir || (stableTies ? String(a._id).localeCompare(String(b._id)) : 0);
    });
  }

  private async getModeratorAirlineId(userId: string) {
    if (!userId)
      throw new ForbiddenException('You are not assigned to an airline'); // new line
    const assignment = await this.assignmentModel.findOne({
      moderatorId: userId,
      providerType: ProviderType.AIRLINE,
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to an airline');
    }

    return assignment.providerId;
  }

  private async getAirports(
    departureCode: CreateFlightsDto['departureAirport'],
    arrivalCode: CreateFlightsDto['arrivalAirport'],
  ): Promise<{
    departureAirport: AirportDocument;
    arrivalAirport: AirportDocument;
  }> {
    const departureIata = departureCode as unknown as string;
    const arrivalIata = arrivalCode as unknown as string;
    const codes =
      departureIata === arrivalIata
        ? [departureIata]
        : [departureIata, arrivalIata];

    const airports = await this.airportModel
      .find({ iataCode: { $in: codes } })
      .exec();

    const airportByCode = new Map(
      airports.map((airport) => [airport.iataCode, airport]),
    );

    const departureAirport = airportByCode.get(departureIata);
    const arrivalAirport = airportByCode.get(arrivalIata);

    if (!departureAirport || !arrivalAirport) {
      throw new BadRequestException('One or both airports do not exist');
    }

    return { departureAirport, arrivalAirport };
  }

  private validateFlightSchedule(
    departureAirport: CreateFlightsDto['departureAirport'],
    arrivalAirport: CreateFlightsDto['arrivalAirport'],
    departureUtc: Date,
    arrivalUtc: Date,
  ): void {
    if (departureAirport === arrivalAirport) {
      throw new BadRequestException(
        'Departure and Arrival airport cannot be the same.',
      );
    }

    if (arrivalUtc <= departureUtc) {
      throw new BadRequestException(
        'Arrival time cannot be before Departure time.',
      );
    }

    if (departureUtc < new Date()) {
      throw new BadRequestException('Departure time cannot be in the past.');
    }
  }

  private assertRealLocalDateTime(value: string, field: string): void {
    const [datePart, timePart] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);

    const probe = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const isReal =
      probe.getUTCFullYear() === y &&
      probe.getUTCMonth() === m - 1 &&
      probe.getUTCDate() === d &&
      probe.getUTCHours() === hh &&
      probe.getUTCMinutes() === mm;

    if (!isReal) {
      throw new BadRequestException(`${field} is not a real date and time`);
    }
  }

  private async ensureNoDuplicateFlight(
    airlineId: ModeratorAssignment['providerId'],
    flightNumber: string,
    departureLocalDate: string,
  ): Promise<void> {
    const existingFlight = await this.flightsModel
      .exists({ airline: airlineId, flightNumber, departureLocalDate })
      .exec();

    if (existingFlight) {
      throw new ConflictException(
        'A flight with this number already exists on this date',
      );
    }
  }
}
