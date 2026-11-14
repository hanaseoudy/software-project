import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Flight, FlightStatus } from '../flights/schemas/flight.schema';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import { PassengerType } from './schemas/passenger.schema';

export const HOLD_DURATION_MS = 10 * 60 * 1000; // FLT-22: 10-minute hold
const INFANT_FARE_RATIO = 0.1; // infants pay 10% (see Cabin.price comment)

@Injectable()
export class FlightBookingsService {
  constructor(
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
  ) {}

  /**
   * FLT-22: reserve seats atomically and create a PENDING_PAYMENT booking
   * that expires after 10 minutes.
   */
  async createHold(userId: string, dto: HoldFlightBookingDto) {
    const adults = dto.passengers.filter((p) => p.type === PassengerType.ADULT).length;
    const children = dto.passengers.filter((p) => p.type === PassengerType.CHILD).length;
    const infants = dto.passengers.filter((p) => p.type === PassengerType.INFANT).length;
    const seats = adults + children; // infants do not occupy a seat

    if (adults < 1) {
      throw new BadRequestException('At least one adult passenger is required');
    }
    if (infants > adults) {
      throw new BadRequestException('Each infant needs an accompanying adult');
    }
    if (dto.tripType === 'ROUND_TRIP' && !dto.returnFlightId) {
      throw new BadRequestException('returnFlightId is required for ROUND_TRIP');
    }
    if (dto.tripType === 'ONE_WAY' && dto.returnFlightId) {
      throw new BadRequestException('returnFlightId is not allowed for ONE_WAY');
    }

    const legIds = [dto.outboundFlightId];
    if (dto.tripType === 'ROUND_TRIP' && dto.returnFlightId) {
      legIds.push(dto.returnFlightId);
    }

    // Load flights to validate them and to calculate the price.
    const flights: Array<Awaited<ReturnType<typeof this.loadFlight>>> = [];
    let totalPrice = 0;
    for (const flightId of legIds) {
      const flight = await this.loadFlight(flightId);
      flights.push(flight);
      if (flight.status !== FlightStatus.SCHEDULED || flight.departureTime <= new Date()) {
        throw new BadRequestException(`Flight ${flight.flightNumber} is not available for booking`);
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
    outbound: { _id: Types.ObjectId; departureAirport: Types.ObjectId; arrivalAirport: Types.ObjectId; arrivalTime: Date },
    inbound: { _id: Types.ObjectId; departureAirport: Types.ObjectId; arrivalAirport: Types.ObjectId; departureTime: Date },
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