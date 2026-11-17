import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Flight } from '../flights/schemas/flight.schema';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingType } from '../payments/enums/payment.enums';
import { PaymentsService } from '../payments/payments.service';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import { PassengerType } from './schemas/passenger.schema';
import { generateFlightReference } from './utils/flight-reference';

const MAX_REFERENCE_ATTEMPTS = 5;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * FLT-23: PAY-01 confirms the flight booking (status CONFIRMED) when the payment
 * webhook arrives and then calls the booking-confirmed hook. This service
 * registers on that hook and does the rest: a unique booking reference, held
 * seats -> booked seats, and the in-app notification.
 */
@Injectable()
export class FlightBookingConfirmationService implements OnModuleInit {
  private readonly logger = new Logger(FlightBookingConfirmationService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<Flight>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.paymentsService.onBookingConfirmed(async (event) => {
      if (event.bookingType === BookingType.FLIGHT) {
        await this.finalizeConfirmed(event.bookingId);
      }
    });
  }

  /**
   * Safety net: if the server restarted right after payment, or the hook
   * failed, a booking stays CONFIRMED without a reference (and its seats stay
   * "held"). Every hour, finish those bookings. finalizeConfirmed only matches
   * CONFIRMED bookings without a reference, so a booking that was already
   * handled is never changed twice.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async finalizeMissedConfirmations(): Promise<number> {
    const missed = await this.bookingModel
      .find({
        status: FlightBookingStatus.CONFIRMED,
        bookingReference: { $exists: false },
      })
      .select('_id')
      .limit(100);

    let finalized = 0;
    for (const booking of missed) {
      try {
        if (await this.finalizeConfirmed(String(booking._id))) {
          finalized++;
        }
      } catch (error) {
        this.logger.error(
          `Could not finalize flight booking ${String(booking._id)}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    if (finalized > 0) {
      this.logger.log(
        `Finalized ${finalized} confirmed flight booking(s) without a reference`,
      );
    }
    return finalized;
  }

  /**
   * Gives a booking that PAY-01 already confirmed its booking reference, turns its
   * held seats into booked seats and notifies the user. The reference is set by one
   * atomic update that only matches a CONFIRMED booking without a reference, so a
   * repeated webhook changes nothing, converts no seats twice and sends no second
   * notification. If the seats cannot be converted, the reference is removed again
   * so the next run can retry. Returns the updated booking, or null if nothing matched.
   */
  async finalizeConfirmed(bookingId: string): Promise<FlightBooking | null> {
    if (!Types.ObjectId.isValid(bookingId)) {
      return null;
    }
    const id = new Types.ObjectId(bookingId);

    const booking = await this.claimReference(id);
    if (!booking) {
      return null;
    }

    try {
      await this.convertHeldSeats(booking);
    } catch (error) {
      await this.bookingModel.updateOne(
        { _id: id },
        { $unset: { bookingReference: 1 } },
      );
      throw error;
    }

    await this.notifyConfirmed(booking);
    return booking;
  }

  private async claimReference(
    id: Types.ObjectId,
  ): Promise<FlightBooking | null> {
    for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt++) {
      try {
        return await this.bookingModel.findOneAndUpdate(
          {
            _id: id,
            status: FlightBookingStatus.CONFIRMED,
            bookingReference: { $exists: false },
          },
          { $set: { bookingReference: generateFlightReference() } },
          { returnDocument: 'after' },
        );
      } catch (error) {
        // Extremely unlikely reference collision: try another reference.
        if (isDuplicateKeyError(error) && attempt < MAX_REFERENCE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  /** Infants do not occupy a seat, so only the other passengers count. */
  private async convertHeldSeats(booking: FlightBooking): Promise<void> {
    const seats = booking.passengers.filter(
      (p) => p.type !== PassengerType.INFANT,
    ).length;
    const flightIds = [booking.outboundFlight, booking.returnFlight].filter(
      (f): f is Types.ObjectId => !!f,
    );

    const converted: Types.ObjectId[] = [];
    try {
      for (const flightId of flightIds) {
        const result = await this.flightModel.updateOne(
          { _id: flightId },
          {
            $inc: {
              'cabins.$[c].heldSeats': -seats,
              'cabins.$[c].bookedSeats': seats,
            },
          },
          {
            arrayFilters: [
              {
                'c.cabinClass': booking.cabinClass,
                'c.heldSeats': { $gte: seats },
              },
            ],
          },
        );
        if (result.modifiedCount !== 1) {
          throw new Error(
            `Flight ${String(flightId)}: could not convert ${seats} held seat(s) to booked`,
          );
        }
        converted.push(flightId);
      }
    } catch (error) {
      // Put back what was already converted so a retry starts from the same state.
      for (const flightId of converted) {
        await this.flightModel.updateOne(
          { _id: flightId },
          {
            $inc: {
              'cabins.$[c].heldSeats': seats,
              'cabins.$[c].bookedSeats': -seats,
            },
          },
          { arrayFilters: [{ 'c.cabinClass': booking.cabinClass }] },
        );
      }
      throw error;
    }
  }

  /** A notification failure must never undo a confirmed, paid booking. */
  private async notifyConfirmed(booking: FlightBooking): Promise<void> {
    try {
      await this.notificationsService.create(booking.user, {
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Flight booking confirmed',
        message:
          `Your flight booking ${booking.bookingReference} is confirmed ` +
          `(${booking.passengers.length} passenger(s), ` +
          `${booking.tripType === 'ROUND_TRIP' ? 'round trip' : 'one way'}, ` +
          `total ${booking.totalPrice + (booking.baggageFees ?? 0)} ${booking.currency}). ` +
          'Your e-ticket is ready to download.',
        metadata: {
          bookingId: String(booking._id),
          bookingReference: booking.bookingReference,
          outboundFlight: String(booking.outboundFlight),
          returnFlight: booking.returnFlight
            ? String(booking.returnFlight)
            : undefined,
          cabinClass: booking.cabinClass,
          passengers: booking.passengers.length,
          totalPrice: booking.totalPrice + (booking.baggageFees ?? 0),
          currency: booking.currency,
        },
      });
    } catch (error) {
      this.logger.error(
        `Flight booking ${String(booking._id)} confirmed but notification failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
