import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookingType } from '../payments/enums/payment.enums';
import {
  FlightBooking,
  FlightBookingStatus,
} from '../flight-bookings/schemas/flight-booking.schema';
import {
  HotelBooking,
  HotelBookingStatus,
} from '../hotel-bookings/schemas/hotel-booking.schema';

// Statuses in which a booking is still waiting for payment (PAY-02 only applies here)
const PAYABLE_FLIGHT = [FlightBookingStatus.HELD, FlightBookingStatus.PENDING_PAYMENT];
const PAYABLE_HOTEL = [HotelBookingStatus.PENDING_PAYMENT];

@Injectable()
export class PoliciesService {
  constructor(
    @InjectModel(FlightBooking.name) private flightBookingModel: Model<any>,
    @InjectModel(HotelBooking.name) private hotelBookingModel: Model<any>,
  ) {}

  private modelFor(type: BookingType): Model<any> {
    return type === BookingType.FLIGHT ? this.flightBookingModel : this.hotelBookingModel;
  }

  /** Loads a booking (with provider data) and makes sure it belongs to the caller. */
  private async loadOwned(type: BookingType, id: string, userId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid booking id');

    const booking: any =
      type === BookingType.FLIGHT
        ? await this.flightBookingModel
            .findById(id)
            .populate({ path: 'outboundFlight', populate: { path: 'airline' } })
            .populate({ path: 'returnFlight', populate: { path: 'airline' } })
            .lean()
        : await this.hotelBookingModel.findById(id).populate('hotel').lean();

    if (!booking) throw new NotFoundException('Booking not found');
    if (String(booking.user) !== String(userId)) {
      throw new ForbiddenException('You can only access your own bookings');
    }
    return booking;
  }

  /** Airline: cancellation + baggage policies. Hotel: cancellation policy + check-in/out times. */
  private buildPolicies(type: BookingType, booking: any) {
    if (type === BookingType.FLIGHT) {
      const legs = [
        { direction: 'outbound', flight: booking.outboundFlight },
        { direction: 'return', flight: booking.returnFlight },
      ].filter((l) => !!l.flight);

      return {
        bookingType: type,
        cabinClass: booking.cabinClass,
        flights: legs.map(({ direction, flight }) => {
          const airline = flight.airline;
          const cabin = flight.cabins?.find((c: any) => c.cabinClass === booking.cabinClass);
          return {
            direction,
            flightNumber: flight.flightNumber,
            airline: { id: airline._id, name: airline.name, code: airline.code },
            cancellationPolicy: airline.cancellationPolicy,
            baggagePolicy: {
              freeBags: cabin?.freeBags ?? 0,
              maxBagWeightKg: cabin?.maxBagWeightKg ?? null,
              extraBagPrice: airline.baggagePolicy?.extraBagPrice ?? 0,
              maxExtraBagsPerPassenger: airline.baggagePolicy?.maxExtraBagsPerPassenger ?? 0,
            },
          };
        }),
      };
    }

    const hotel = booking.hotel;
    return {
      bookingType: type,
      hotel: { id: hotel._id, name: hotel.name },
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationPolicy: { tiers: hotel.policies?.cancellationTiers ?? [] },
    };
  }

  // GET /api/bookings/:type/:id/policies
  async getPolicies(type: BookingType, id: string, userId: string) {
    const booking = await this.loadOwned(type, id, userId);
    return {
      bookingId: id,
      policies: this.buildPolicies(type, booking),
      accepted: !!booking.policiesAcceptedAt,
      acceptedAt: booking.policiesAcceptedAt ?? null,
    };
  }

  // POST /api/bookings/:type/:id/accept-policies
  async acceptPolicies(type: BookingType, id: string, userId: string) {
    const booking = await this.loadOwned(type, id, userId);

    const payable = type === BookingType.FLIGHT ? PAYABLE_FLIGHT : PAYABLE_HOTEL;
    if (!(payable as string[]).includes(booking.status)) {
      throw new BadRequestException('This booking is not awaiting payment');
    }
    if (booking.holdExpiresAt && new Date(booking.holdExpiresAt) < new Date()) {
      throw new BadRequestException('The hold on this booking has expired');
    }
    // Already accepted: keep the original timestamp
    if (booking.policiesAcceptedAt) {
      return { bookingId: id, accepted: true, acceptedAt: booking.policiesAcceptedAt };
    }

    const acceptedAt = new Date();
    const result = await this.modelFor(type).updateOne(
      {
        _id: id,
        user: userId,
        status: { $in: payable },
        policiesAcceptedAt: { $exists: false },
      },
      { $set: { policiesAcceptedAt: acceptedAt } },
    );

    if (result.modifiedCount === 0) {
      // someone (e.g. a double click) accepted a moment ago: return the stored value
      const fresh: any = await this.modelFor(type).findById(id).select('policiesAcceptedAt').lean();
      return { bookingId: id, accepted: true, acceptedAt: fresh?.policiesAcceptedAt ?? acceptedAt };
    }
    return { bookingId: id, accepted: true, acceptedAt };
  }

  /**
   * For PAY-01: call this in createPayment() and retry() BEFORE creating the Stripe PaymentIntent.
   * Throws 403 if the user has not accepted the policies.
   */
  async assertAccepted(type: BookingType, bookingId: string) {
    const booking: any = await this.modelFor(type)
      .findById(bookingId)
      .select('policiesAcceptedAt')
      .lean();
    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.policiesAcceptedAt) {
      throw new ForbiddenException('Provider policies must be accepted before payment');
    }
  }
}
