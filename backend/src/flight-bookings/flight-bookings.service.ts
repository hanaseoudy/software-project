import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airline } from '../airlines/schemas/airline.schema';
import { Airport } from '../airports/schemas/airport.schema';
import { Flight, FlightStatus } from '../flights/schemas/flight.schema';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import { PassengerType } from './schemas/passenger.schema';
import {
  BaggageRuleError,
  calculateLegBaggageFees,
} from './utils/baggage-fees';
import { buildETicketPdf } from './utils/e-ticket-pdf';
import { buildBookingSummary } from './utils/booking-summary';
import type { SummaryFlight } from './utils/booking-summary';
import { BookingGroup, ListMyBookingsDto } from './dto/list-my-bookings.dto';
import { formatInTimeZone } from 'date-fns-tz';

export const HOLD_DURATION_MS = 10 * 60 * 1000; // FLT-22: 10-minute hold
const INFANT_FARE_RATIO = 0.1; // infants pay 10% (see Cabin.price comment)

@Injectable()
export class FlightBookingsService {
  constructor(
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
  ) {}

  private readonly PAGE_SIZE = 10;

  private readonly FLIGHT_POPULATE = ['outboundFlight', 'returnFlight'].map(
    (path) => ({
      path,
      populate: [
        { path: 'airline', select: 'name code logoUrl' },
        { path: 'departureAirport', select: 'iataCode city timezone' },
        { path: 'arrivalAirport', select: 'iataCode city timezone' },
      ],
    }),
  );

  async findMine(userId: string, dto: ListMyBookingsDto) {
    const bookings = await this.bookingModel
      .find({
        user: userId,
        status: {
          $in: [
            FlightBookingStatus.CONFIRMED,
            FlightBookingStatus.COMPLETED,
            FlightBookingStatus.CANCELLED,
          ],
        },
      })
      .populate(this.FLIGHT_POPULATE)
      .lean();

    const now = new Date();
    const inGroup = bookings
      .filter((b) => b.outboundFlight)
      .filter((b) => this.groupOf(b, now) === dto.group)
      .sort((a: any, b: any) => {
        const diff =
          a.outboundFlight.departureTime - b.outboundFlight.departureTime;
        return dto.group === BookingGroup.UPCOMING ? diff : -diff;
      });

    const start = (dto.page - 1) * this.PAGE_SIZE;
    return {
      items: inGroup
        .slice(start, start + this.PAGE_SIZE)
        .map((b) => this.toCard(b)),
      page: dto.page,
      pageSize: this.PAGE_SIZE,
      total: inGroup.length,
    };
  }

  async findMineById(userId: string, bookingId: string) {
    const { summary, bookingReference } = await this.loadOwnedSummary(
      userId,
      bookingId,
    );
    return { ...summary, bookingReference };
  }

  private groupOf(b: any, now: Date): BookingGroup {
    if (b.status === FlightBookingStatus.CANCELLED)
      return BookingGroup.CANCELLED;
    if (
      b.status === FlightBookingStatus.COMPLETED ||
      b.outboundFlight.departureTime < now
    ) {
      return BookingGroup.PAST;
    }
    return BookingGroup.UPCOMING;
  }

  private toCard(b: any) {
    const fmt = (utc: Date, tz: string) =>
      formatInTimeZone(utc, tz, "yyyy-MM-dd'T'HH:mm");

    const leg = (f: any) => ({
      flightNumber: f.flightNumber,
      airline: f.airline,
      from: f.departureAirport,
      to: f.arrivalAirport,
      departureLocal: fmt(f.departureTime, f.departureAirport.timezone),
      departureUtc: f.departureTime,
      arrivalLocal: fmt(f.arrivalTime, f.arrivalAirport.timezone),
      arrivalUtc: f.arrivalTime,
    });

    return {
      id: b._id,
      bookingReference: b.bookingReference,
      status: b.status,
      tripType: b.tripType,
      date: b.outboundFlight.departureLocalDate, // assumed field name, check your Flight schema
      cabinClass: b.cabinClass,
      passengers: b.passengers.map((p: any) => `${p.firstName} ${p.lastName}`),
      totalPrice: b.totalPrice,
      currency: b.currency,
      outbound: leg(b.outboundFlight),
      ...(b.returnFlight && { return: leg(b.returnFlight) }),
    };
  }
  /**
   * FLT-21: booking summary shown before payment (flight, passengers, baggage,
   * total). Only the owner of the booking can read it.
   */
  async getSummary(userId: string, bookingId: string) {
    return (await this.loadOwnedSummary(userId, bookingId)).summary;
  }

  /**
   * FLT-23: confirmation page data: the booking summary plus the booking
   * reference. Only available once the booking is confirmed (or completed).
   */
  async getConfirmation(userId: string, bookingId: string) {
    const { summary, bookingReference } = await this.loadConfirmed(
      userId,
      bookingId,
    );
    return { ...summary, bookingReference };
  }

  /** FLT-23: downloadable e-ticket (PDF) of a confirmed booking. */
  async getETicket(userId: string, bookingId: string) {
    const { summary, bookingReference } = await this.loadConfirmed(
      userId,
      bookingId,
    );
    return {
      filename: `e-ticket-${bookingReference}.pdf`,
      pdf: await buildETicketPdf(summary, bookingReference),
    };
  }

  private async loadConfirmed(userId: string, bookingId: string) {
    const { summary, bookingReference } = await this.loadOwnedSummary(
      userId,
      bookingId,
    );
    const confirmed =
      summary.status === FlightBookingStatus.CONFIRMED ||
      summary.status === FlightBookingStatus.COMPLETED;
    if (!confirmed) {
      throw new ConflictException('Booking is not confirmed yet');
    }
    if (!bookingReference) {
      // Paid, but the reference is still being generated (the hourly job completes it).
      throw new ConflictException(
        'Booking reference is not ready yet, try again shortly',
      );
    }
    return { summary, bookingReference };
  }

  private async loadOwnedSummary(userId: string, bookingId: string) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    const booking = await this.bookingModel
      .findOne({
        _id: new Types.ObjectId(bookingId),
        user: new Types.ObjectId(userId),
      })
      .lean();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const outbound = await this.loadSummaryFlight(booking.outboundFlight);
    const inbound = booking.returnFlight
      ? await this.loadSummaryFlight(booking.returnFlight)
      : undefined;

    const summary = buildBookingSummary(
      {
        id: String(booking._id),
        status: booking.status,
        tripType: booking.tripType,
        cabinClass: booking.cabinClass,
        currency: booking.currency,
        totalPrice: booking.totalPrice,
        baggageFees: booking.baggageFees,
        holdExpiresAt: booking.holdExpiresAt,
        passengers: booking.passengers,
      },
      outbound,
      inbound,
    );
    return { summary, bookingReference: booking.bookingReference };
  }

  private async loadSummaryFlight(
    flightId: Types.ObjectId,
  ): Promise<SummaryFlight> {
    const flight = await this.flightModel.findById(flightId).lean();
    if (!flight) {
      throw new NotFoundException('Flight of this booking no longer exists');
    }
    const [airline, departure, arrival] = await Promise.all([
      this.airlineModel.findById(flight.airline).lean(),
      this.airportModel.findById(flight.departureAirport).lean(),
      this.airportModel.findById(flight.arrivalAirport).lean(),
    ]);
    if (!departure || !arrival) {
      throw new NotFoundException('Airport of this booking no longer exists');
    }
    const toAirport = (a: Airport) => ({
      iataCode: a.iataCode,
      name: a.name,
      city: a.city,
      timezone: a.timezone,
    });
    return {
      flightNumber: flight.flightNumber,
      airlineName: airline?.name ?? '',
      departureAirport: toAirport(departure),
      arrivalAirport: toAirport(arrival),
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      durationMinutes: flight.durationMinutes,
    };
  }

  /**
   * FLT-22: reserve seats atomically and create a PENDING_PAYMENT booking
   * that expires after 10 minutes.
   */
  async createHold(userId: string, dto: HoldFlightBookingDto) {
    const adults = dto.passengers.filter(
      (p) => p.type === PassengerType.ADULT,
    ).length;
    const children = dto.passengers.filter(
      (p) => p.type === PassengerType.CHILD,
    ).length;
    const infants = dto.passengers.filter(
      (p) => p.type === PassengerType.INFANT,
    ).length;
    const seats = adults + children; // infants do not occupy a seat

    if (adults < 1) {
      throw new BadRequestException('At least one adult passenger is required');
    }
    if (infants > adults) {
      throw new BadRequestException('Each infant needs an accompanying adult');
    }
    if (dto.tripType === 'ROUND_TRIP' && !dto.returnFlightId) {
      throw new BadRequestException(
        'returnFlightId is required for ROUND_TRIP',
      );
    }
    if (dto.tripType === 'ONE_WAY' && dto.returnFlightId) {
      throw new BadRequestException(
        'returnFlightId is not allowed for ONE_WAY',
      );
    }

    const legIds = [dto.outboundFlightId];
    if (dto.tripType === 'ROUND_TRIP' && dto.returnFlightId) {
      legIds.push(dto.returnFlightId);
    }

    // Load flights to validate them and to calculate the price.
    const flights: Array<Awaited<ReturnType<typeof this.loadFlight>>> = [];
    let totalPrice = 0;
    let baggageFees = 0;
    for (const flightId of legIds) {
      const flight = await this.loadFlight(flightId);
      flights.push(flight);
      if (
        flight.status !== FlightStatus.SCHEDULED ||
        flight.departureTime <= new Date()
      ) {
        throw new BadRequestException(
          `Flight ${flight.flightNumber} is not available for booking`,
        );
      }
      const cabin = flight.cabins.find(
        (c) => c.cabinClass === (dto.cabinClass as string),
      );
      if (!cabin) {
        throw new BadRequestException(
          `Flight ${flight.flightNumber} has no ${dto.cabinClass} cabin`,
        );
      }
      totalPrice +=
        cabin.price * seats + cabin.price * INFANT_FARE_RATIO * infants;

      // FLT-19: free bags vs the cabin allowance (FLT-04), extra bags vs the
      // airline's baggage policy (FLT-08). Each leg of a round trip is charged.
      const airline = await this.airlineModel.findById(flight.airline).lean();
      // ACC-15: a deactivated airline's flights cannot be booked.
      if (airline?.isActive === false) {
        throw new BadRequestException(
          `Flight ${flight.flightNumber} is not available for booking`,
        );
      }
      try {
        baggageFees += calculateLegBaggageFees(
          dto.passengers,
          cabin,
          airline?.baggagePolicy,
        ).total;
      } catch (error) {
        if (error instanceof BaggageRuleError) {
          throw new BadRequestException(
            `Flight ${flight.flightNumber}: ${error.message}`,
          );
        }
        throw error;
      }
    }

    if (dto.tripType === 'ROUND_TRIP') {
      this.validateRoundTrip(flights[0], flights[1]);
    }

    // Atomic holds. If a later step fails we release what we already took.
    const held: string[] = [];
    try {
      for (const flightId of legIds) {
        const ok = await this.holdSeats(flightId, dto.cabinClass, seats);
        if (!ok) {
          throw new ConflictException(
            'Not enough seats available in the selected cabin',
          );
        }
        held.push(flightId);
      }

      return await this.bookingModel.create({
        user: new Types.ObjectId(userId),
        outboundFlight: new Types.ObjectId(dto.outboundFlightId),
        returnFlight: dto.returnFlightId
          ? new Types.ObjectId(dto.returnFlightId)
          : undefined,
        tripType: dto.tripType,
        cabinClass: dto.cabinClass,
        passengers: dto.passengers.map((p) => ({
          ...p,
          dateOfBirth: new Date(p.dateOfBirth),
          baggage: p.baggage ?? [],
        })),
        totalPrice: Math.round(totalPrice * 100) / 100,
        // Kept apart from the seat fares: PAY-01 charges totalPrice + baggageFees.
        baggageFees: Math.round(baggageFees * 100) / 100,
        status: FlightBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: new Date(Date.now() + HOLD_DURATION_MS),
      });
    } catch (err) {
      for (const flightId of held) {
        await this.releaseSeats(flightId, dto.cabinClass, seats);
      }
      throw err;
    }
  }

  private async loadFlight(flightId: string) {
    const flight = await this.flightModel.findById(flightId).lean();
    if (!flight) {
      throw new NotFoundException(`Flight ${flightId} not found`);
    }
    return flight;
  }

  /**
   * Return flight must be a different flight, fly the reverse route and
   * depart after the outbound flight arrives.
   */
  private validateRoundTrip(
    outbound: {
      _id: Types.ObjectId;
      departureAirport: Types.ObjectId;
      arrivalAirport: Types.ObjectId;
      arrivalTime: Date;
    },
    inbound: {
      _id: Types.ObjectId;
      departureAirport: Types.ObjectId;
      arrivalAirport: Types.ObjectId;
      departureTime: Date;
    },
  ) {
    if (outbound._id.equals(inbound._id)) {
      throw new BadRequestException(
        'Return flight must be different from the outbound flight',
      );
    }
    if (
      !outbound.departureAirport.equals(inbound.arrivalAirport) ||
      !outbound.arrivalAirport.equals(inbound.departureAirport)
    ) {
      throw new BadRequestException(
        'Return flight must follow the reverse route of the outbound flight',
      );
    }
    if (inbound.departureTime <= outbound.arrivalTime) {
      throw new BadRequestException(
        'Return flight must depart after the outbound flight arrives',
      );
    }
  }

  /**
   * One single updateOne: the seat check and the increment happen in the
   * same atomic operation, so concurrent requests can never oversell.
   * Returns true only if the seats were really reserved.
   */
  async holdSeats(
    flightId: string,
    cabinClass: string,
    seats: number,
  ): Promise<boolean> {
    const result = await this.flightModel.updateOne(
      {
        _id: new Types.ObjectId(flightId),
        status: FlightStatus.SCHEDULED,
        departureTime: { $gt: new Date() },
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: '$cabins',
                  as: 'c',
                  cond: {
                    $and: [
                      { $eq: ['$$c.cabinClass', cabinClass] },
                      {
                        $gte: [
                          {
                            $subtract: [
                              '$$c.totalSeats',
                              { $add: ['$$c.bookedSeats', '$$c.heldSeats'] },
                            ],
                          },
                          seats,
                        ],
                      },
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      },
      { $inc: { 'cabins.$[c].heldSeats': seats } },
      { arrayFilters: [{ 'c.cabinClass': cabinClass }] },
    );
    return result.modifiedCount === 1;
  }

  /** Gives held seats back (used on failure and when a hold expires). */
  async releaseSeats(
    flightId: string,
    cabinClass: string,
    seats: number,
  ): Promise<void> {
    await this.flightModel.updateOne(
      { _id: new Types.ObjectId(flightId) },
      { $inc: { 'cabins.$[c].heldSeats': -seats } },
      {
        arrayFilters: [
          { 'c.cabinClass': cabinClass, 'c.heldSeats': { $gte: seats } },
        ],
      },
    );
  }
}
