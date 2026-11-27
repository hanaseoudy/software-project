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
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TZDate } from '@date-fns/tz';
import { Flight, FlightDocument, FlightStatus } from './schemas/flight.schema';
import { Airport, AirportDocument } from '../airports/schemas/airport.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { CreateFlightsDto } from './dto/create-flights.dto';
import { UpdateFlightDto } from './dto/update-flights.dto';
import { UpdateCabinDto } from './dto/update-cabin.dto';
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
import { NotificationsService } from '../notifications/notifications.service';
import { CancelFlightDto } from './dto/cancel-flight.dto';
import {
  FlightBooking,
  FlightBookingDocument,
  FlightBookingStatus,
} from '../flight-bookings/schemas/flight-booking.schema';
import { PassengerType } from '../flight-bookings/schemas/passenger.schema';
import { BookingType } from '../payments/enums/payment.enums';
import { NotificationType } from '../notifications/enums/notification.enums';
import { RefundsService, refundQuote } from '../payments/refunds.service';
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
    private readonly flightBookingModel: Model<FlightBookingDocument>,
    private readonly refundsService: RefundsService,
    private readonly notificationsService: NotificationsService,
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
  async searchToAirports(
    dto: Omit<SearchFlightsDto, 'arrivalAirport'>,
    arrivalCodes: readonly string[],
  ) {
    const codes = [...new Set(arrivalCodes)].filter(
      (code) => code !== dto.departureAirport,
    );
    const result = await this.searchRoutes(
      { ...dto, arrivalAirport: codes[0] ?? '' },
      codes,
    );
    const unique = (flights: any[]) => {
      const byId = new Map<string, any>();
      for (const flight of flights) {
        const id = flight._id?.toString();
        if (!id || !isValidObjectId(id))
          throw new ServiceUnavailableException(
            'Flight search returned an invalid identifier',
          );
        if (!byId.has(id)) byId.set(id, flight);
      }
      return [...byId.values()];
    };
    return {
      outbound: unique(result.outbound),
      ...(result.return === undefined ? {} : { return: unique(result.return) }),
    };
  }

  private async searchRoutes(
    dto: SearchFlightsDto,
    arrivalCodes?: readonly string[],
  ) {
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
    const outbound = this.sortFlights(
      outboundRaw,
      dto.sortBy,
      dto.sortOrder,
      arrivalCodes !== undefined,
    ); // ADDED (FLT-15)

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

    const returning = this.sortFlights(
      returningRaw,
      dto.sortBy,
      dto.sortOrder,
      arrivalCodes !== undefined,
    ); // ADDED (FLT-15)

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

  /**
   * FLT-06: Cancels a moderator's Scheduled flight after confirmation,
   * cancels all Confirmed bookings with a 100% refund (PAY-03),
   * releases pending seat holds, and sends in-app notifications to passengers.
   */
  async cancelFlight(flightId: string, userId: string, dto: CancelFlightDto) {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException('Invalid flight ID format');
    }

    // Reuses ownership check (403) + SCHEDULED status check (409)[cite: 3]
    const flight = await this.loadOwnedScheduledFlight(flightId, userId);

    // FLT-30: Ensure departureTime hasn't already passed before the cron tick[cite: 2]
    await this.assertFlightScheduled(flight);

    const cancellationReason =
      dto.reason?.trim() ||
      `Flight ${flight.flightNumber} cancelled by airline`;
    const now = new Date();

    // 1. Transition flight status to CANCELLED (automatically hides it from GET /api/flights/search)[cite: 2]
    flight.status = FlightStatus.CANCELLED;
    flight.cabins.forEach((cabin) => {
      cabin.bookedSeats = 0;
      cabin.heldSeats = 0;
    });
    await flight.save();

    // 2. Find all active bookings (CONFIRMED or PENDING_PAYMENT) referencing this flight[cite: 3]
    const bookings = await this.flightBookingModel.find({
      $or: [{ outboundFlight: flight._id }, { returnFlight: flight._id }],
      status: {
        $in: [
          FlightBookingStatus.CONFIRMED,
          FlightBookingStatus.PENDING_PAYMENT,
        ],
      },
    });

    const passengerUserIds = new Set<string>();

    for (const booking of bookings) {
      const seatCount = booking.passengers.filter(
        (p) => p.type !== PassengerType.INFANT,
      ).length;

      // Identify the OTHER leg if this is a round-trip booking so its seats are also freed
      const otherFlightId =
        booking.outboundFlight.toString() === flight._id.toString()
          ? booking.returnFlight
          : booking.outboundFlight;

      if (booking.status === FlightBookingStatus.CONFIRMED) {
        booking.status = FlightBookingStatus.CANCELLED;
        booking.cancelledAt = now;
        booking.cancellationReason = cancellationReason;
        // issueRefund() only runs after the booking is persisted as CANCELLED.
        await booking.save();

        // PAY-03: 100% of the amount charged (seat fares + baggage fees).
        const quote = refundQuote({
          paidAmount:
            Math.round(
              (booking.totalPrice + (booking.baggageFees ?? 0)) * 100,
            ) / 100,
          providerInitiated: true,
        });

        try {
          await this.refundsService.issueRefund({
            bookingType: BookingType.FLIGHT,
            bookingId: booking._id,
            amount: quote.amount,
            appliedPolicy: quote.appliedPolicy,
            reason: cancellationReason,
          });
        } catch (error) {
          // The flight and this booking stay cancelled. One Stripe failure must not stop the rest.
          this.logger.error(
            `Booking ${String(booking._id)} cancelled but the refund failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        if (otherFlightId) {
          await this.releaseSeatsOnOtherLeg(
            otherFlightId,
            booking.cabinClass,
            seatCount,
            'bookedSeats',
          );
        }

        passengerUserIds.add(booking.user.toString());
      } else if (booking.status === FlightBookingStatus.PENDING_PAYMENT) {
        // Release pending seat hold[cite: 7]
        booking.status = FlightBookingStatus.EXPIRED;
        booking.cancelledAt = now;
        booking.cancellationReason = cancellationReason;

        if (otherFlightId) {
          await this.releaseSeatsOnOtherLeg(
            otherFlightId,
            booking.cabinClass,
            seatCount,
            'heldSeats',
          );
        }

        await booking.save();
      }
    }

    // 3. Send in-app notifications to all passengers with Confirmed bookings (GEN-01)
    if (passengerUserIds.size > 0) {
      await this.notificationsService.createForMany(
        Array.from(passengerUserIds),
        {
          type: NotificationType.BOOKING_CANCELLED, // verify exact enum key in notification.enums.ts
          title: 'Flight Cancelled',
          message: `Your flight ${flight.flightNumber} has been cancelled by the airline. A 100% refund has been initiated.`,
          metadata: {
            flightId: String(flight._id),
            flightNumber: flight.flightNumber,
            reason: cancellationReason,
          },
        },
      );
    }

    const populated = await flight.populate([
      'airline',
      'departureAirport',
      'arrivalAirport',
    ]);

    return {
      flight: formatFlightWithLocalTimes(populated),
      cancelledBookingsCount: passengerUserIds.size,
      releasedHoldsCount: bookings.length - passengerUserIds.size,
    };
  }

  /**
   * Helper: Releases booked or held seats on the opposite leg of a round-trip booking
   * when one leg is cancelled by the airline.
   */
  private async releaseSeatsOnOtherLeg(
    otherFlightId: Types.ObjectId,
    cabinClass: string,
    seats: number,
    field: 'bookedSeats' | 'heldSeats',
  ): Promise<void> {
    await this.flightsModel.updateOne(
      { _id: otherFlightId },
      { $inc: { [`cabins.$[c].${field}`]: -seats } },
      {
        arrayFilters: [
          { 'c.cabinClass': cabinClass, [`c.${field}`]: { $gte: seats } },
        ],
      },
    );
  }

  /**
   * FLT-05: Fetches a flight by ID, verifies the moderator owns its airline,
   * and ensures the flight is still in Scheduled status before editing.
   */
  private async loadOwnedScheduledFlight(flightId: string, userId: string) {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException('Invalid flight ID format');
    }
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const flight = await this.flightsModel.findById(flightId);
    if (!flight) throw new NotFoundException('Flight not found');

    const airlineId = await this.getModeratorAirlineId(userId);
    if (flight.airline.toString() !== airlineId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to modify this flight',
      );
    }

    await this.assertFlightScheduled(flight);

    return flight;
  }

  /**
   * FLT-05: Updates departure/arrival airports and times on a moderator's Scheduled flight,
   * blocking airport changes once seats are booked or held, validating the new schedule in UTC,
   * and preventing duplicate flight numbers on the updated departure date.
   */
  async update(flightId: string, userId: string, dto: UpdateFlightDto) {
    const flight = await this.loadOwnedScheduledFlight(flightId, userId);

    // The local time depends on the airport's time zone, so a new airport needs its time re-sent.
    if (dto.departureAirport && !dto.departureTime) {
      throw new BadRequestException(
        'Changing the departure airport requires departureTime too',
      );
    }
    if (dto.arrivalAirport && !dto.arrivalTime) {
      throw new BadRequestException(
        'Changing the arrival airport requires arrivalTime too',
      );
    }

    const [oldDep, oldArr] = await Promise.all([
      this.airportModel.findById(flight.departureAirport),
      this.airportModel.findById(flight.arrivalAirport),
    ]);

    if (!oldDep) throw new NotFoundException('Departure airport not found');
    if (!oldArr) throw new NotFoundException('Arrival airport not found');

    const { departureAirport: dep, arrivalAirport: arr } =
      await this.getAirports(
        (dto.departureAirport ?? oldDep!.iataCode) as unknown as Airport,
        (dto.arrivalAirport ?? oldArr!.iataCode) as unknown as Airport,
      );

    // FLT-05: Airports cannot be changed once the flight has any active booking
    const airportChanged =
      !dep._id.equals(flight.departureAirport) ||
      !arr._id.equals(flight.arrivalAirport);

    if (airportChanged) {
      const hasBookings = await this.flightBookingModel.exists({
        $or: [{ outboundFlight: flight._id }, { returnFlight: flight._id }],
        status: {
          $in: [
            FlightBookingStatus.PENDING_PAYMENT,
            FlightBookingStatus.CONFIRMED,
            FlightBookingStatus.COMPLETED,
          ],
        },
      });

      if (hasBookings) {
        throw new ConflictException(
          'Airports cannot be changed once the flight has bookings',
        );
      }
    }

    if (dto.departureTime) {
      this.assertRealLocalDateTime(dto.departureTime, 'departureTime');
    }
    if (dto.arrivalTime) {
      this.assertRealLocalDateTime(dto.arrivalTime, 'arrivalTime');
    }

    const departureTime = dto.departureTime
      ? this.countryLocalToUtc(dto.departureTime, dep.timezone)
      : flight.departureTime;
    const arrivalTime = dto.arrivalTime
      ? this.countryLocalToUtc(dto.arrivalTime, arr.timezone)
      : flight.arrivalTime;

    this.validateFlightSchedule(dep, arr, departureTime, arrivalTime);

    const departureLocalDate = formatInTimeZone(
      departureTime,
      dep.timezone,
      'yyyy-MM-dd',
    );
    if (departureLocalDate !== flight.departureLocalDate) {
      await this.ensureNoDuplicateFlight(
        flight.airline,
        flight.flightNumber,
        departureLocalDate,
      );
    }

    const timeChanged =
      departureTime.getTime() !== flight.departureTime.getTime() ||
      arrivalTime.getTime() !== flight.arrivalTime.getTime();

    flight.departureAirport = dep._id;
    flight.arrivalAirport = arr._id;
    flight.departureTime = departureTime;
    flight.arrivalTime = arrivalTime;
    flight.departureLocalDate = departureLocalDate;

    try {
      await flight.save();
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          'A flight with this number already exists on this date',
        );
      }
      throw err;
    }

    if (timeChanged) {
      const confirmedBookings = await this.flightBookingModel
        .find({
          status: FlightBookingStatus.CONFIRMED,
          $or: [{ outboundFlight: flight._id }, { returnFlight: flight._id }],
        })
        .select('user')
        .lean();

      const userIds = confirmedBookings.map((b: any) => b.user);

      await this.notificationsService.createForMany(userIds, {
        type: NotificationType.FLIGHT_SCHEDULE_CHANGED,
        title: 'Flight schedule updated',
        message: `Flight ${flight.flightNumber} (${dep.iataCode} → ${arr.iataCode}) has a new departure/arrival time.`,
        metadata: {
          flightId: String(flight._id),
          flightNumber: flight.flightNumber,
        },
      });
    }

    return formatFlightWithLocalTimes(
      await flight.populate(['airline', 'departureAirport', 'arrivalAirport']),
    );
  }

  /**
   * FLT-05: Updates a cabin's seat capacity and/or price on a moderator's Scheduled flight,
   * requiring at least one field to be provided and preventing totalSeats from dropping
   * below the number of seats already booked or held.
   */
  async updateCabin(
    flightId: string,
    cabinId: string,
    userId: string,
    dto: UpdateCabinDto,
  ) {
    if (dto.totalSeats === undefined && dto.price === undefined) {
      throw new BadRequestException('Send totalSeats and/or price');
    }

    const flight = await this.loadOwnedScheduledFlight(flightId, userId);
    const cabin = flight.cabins.find((c) => String((c as any)._id) === cabinId);
    if (!cabin) throw new NotFoundException('Cabin not found on this flight');
    const cabinWithId = cabin as typeof cabin & { _id: Types.ObjectId };

    if (dto.totalSeats !== undefined) {
      const inUse = cabin.bookedSeats + cabin.heldSeats;
      if (dto.totalSeats < inUse) {
        throw new ConflictException(
          `Cannot reduce seats below ${inUse} (already booked or held)`,
        );
      }
    }

    const set: Record<string, number> = {};
    if (dto.totalSeats !== undefined) {
      set['cabins.$.totalSeats'] = dto.totalSeats;
    }
    if (dto.price !== undefined) {
      set['cabins.$.price'] = dto.price;
    }

    const updated = await this.flightsModel.findOneAndUpdate(
      {
        _id: flight._id,
        airline: flight.airline,
        status: FlightStatus.SCHEDULED,
        cabins: {
          $elemMatch: {
            _id: cabinWithId._id,
            totalSeats: cabin.totalSeats,
            bookedSeats: cabin.bookedSeats,
            heldSeats: cabin.heldSeats,
          },
        },
      },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new ConflictException(
        'Flight or cabin seat counts changed during the update; reload and retry',
      );
    }

    return formatFlightWithLocalTimes(
      await updated.populate(['airline', 'departureAirport', 'arrivalAirport']),
    );
  }

  countryLocalToUtc(localDateTime: string, timezone: string): Date {
    // Ensure we handle both Date objects (if NestJS transformed it) and strings
    const str =
      typeof localDateTime === 'string'
        ? localDateTime
        : (localDateTime as Date).toISOString().slice(0, 19);

    const [datePart, timePart] = str.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);

    // Numeric arguments force TZDate to construct the timestamp strictly in `timezone`
    const zonedDate = TZDate.tz(timezone, y, m - 1, d, hh, mm, 0);
    return new Date(zonedDate.getTime());
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
      .map((row) => row.map((value: unknown) => escapeCsv(value)).join(','))
      .join('\r\n');
  }

  async listMyFlights(moderatorId: string) {
    const assignment = await this.assignmentModel
      .findOne({
        moderatorId: new Types.ObjectId(moderatorId),
        providerType: ProviderType.AIRLINE,
      })
      .lean();

    if (!assignment) {
      throw new NotFoundException('No airline assigned to this moderator');
    }

    return this.flightsModel
      .find({ airline: assignment.providerId })
      .sort({ departureTime: 1 })
      .lean();
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
    return this.flightBookingModel
      .find({
        $or: [
          { outboundFlight: flightObjectId },
          { returnFlight: flightObjectId },
        ],
        status: {
          $in: [FlightBookingStatus.CONFIRMED, FlightBookingStatus.CANCELLED],
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
    let departure: Types.ObjectId | { $in: Types.ObjectId[] },
      arrival: Types.ObjectId | { $in: Types.ObjectId[] };
    if (typeof fromCode === 'string' && typeof toCode === 'string') {
      // Preserve legacy lookup/validation semantics exactly.
      const [from, to] = await Promise.all([
        this.airportModel.findOne({ iataCode: fromCode }),
        this.airportModel.findOne({ iataCode: toCode }),
      ]);
      if (!from || !to) throw new BadRequestException('Unknown airport code');
      departure = from._id;
      arrival = to._id;
    } else {
      const fromCodes =
        typeof fromCode === 'string' ? [fromCode] : [...fromCode];
      const toCodes = typeof toCode === 'string' ? [toCode] : [...toCode];
      if (!fromCodes.length || !toCodes.length) return [];
      const allCodes = [...new Set([...fromCodes, ...toCodes])];
      const airports = await this.airportModel
        .find({ iataCode: { $in: allCodes } })
        .lean();
      const byCode = new Map(
        airports.map((airport) => [airport.iataCode, airport._id]),
      );
      if (allCodes.some((code) => !byCode.has(code)))
        throw new BadRequestException('Unknown airport code');
      departure = { $in: fromCodes.map((code) => byCode.get(code)!) };
      arrival = { $in: toCodes.map((code) => byCode.get(code)!) };
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

      return (
        diff * dir ||
        (stableTies ? String(a._id).localeCompare(String(b._id)) : 0)
      );
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
