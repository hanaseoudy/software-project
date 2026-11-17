import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingType } from '../payments/enums/payment.enums';
import { PaymentsService } from '../payments/payments.service';
import {
  HotelBooking,
  HotelBookingDocument,
  HotelBookingStatus,
} from './schemas/hotel-booking.schema';
import { generateBookingReference } from './utils/booking-reference';

const MAX_REFERENCE_ATTEMPTS = 5;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * HTL-17: PAY-01 confirms the hotel reservation (status CONFIRMED) when the
 * payment webhook arrives and then calls the booking-confirmed hook. This
 * service registers on that hook and adds its part afterwards: a unique booking
 * reference and the in-app notification.
 */
@Injectable()
export class HotelBookingConfirmationService implements OnModuleInit {
  private readonly logger = new Logger(HotelBookingConfirmationService.name);

  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.paymentsService.onBookingConfirmed(async (event) => {
      if (event.bookingType === BookingType.HOTEL) {
        await this.finalizeConfirmed(event.bookingId);
      }
    });
  }

  /**
   * Safety net: if the server restarted right after payment, or the hook
   * failed, a reservation stays CONFIRMED without a booking reference. Every
   * hour, give those reservations their reference (and notification).
   * finalizeConfirmed only matches CONFIRMED reservations without a reference,
   * so running it on a reservation that was already handled changes nothing.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async finalizeMissedConfirmations(): Promise<number> {
    const missed = await this.bookingModel
      .find({
        status: HotelBookingStatus.CONFIRMED,
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
          `Could not finalize reservation ${String(booking._id)}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    if (finalized > 0) {
      this.logger.log(`Finalized ${finalized} confirmed reservation(s) without a reference`);
    }
    return finalized;
  }

  /**
   * Adds the booking reference to a reservation that PAY-01 already confirmed.
   * One atomic update that only matches a CONFIRMED reservation without a
   * reference, so a repeated webhook changes nothing and sends no second
   * notification. Returns the updated reservation, or null if nothing matched.
   */
  async finalizeConfirmed(
    bookingId: string,
  ): Promise<HotelBookingDocument | null> {
    if (!Types.ObjectId.isValid(bookingId)) {
      return null;
    }
    const id = new Types.ObjectId(bookingId);

    for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt++) {
      try {
        const updated = await this.bookingModel.findOneAndUpdate(
          {
            _id: id,
            status: HotelBookingStatus.CONFIRMED,
            bookingReference: { $exists: false },
          },
          { $set: { bookingReference: generateBookingReference() } },
          { returnDocument: 'after' },
        );
        if (!updated) {
          return null;
        }
        await this.notifyConfirmed(updated);
        return updated;
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

  /** A notification failure must never undo a confirmed, paid reservation. */
  private async notifyConfirmed(booking: HotelBookingDocument): Promise<void> {
    try {
      await this.notificationsService.create(booking.user, {
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Hotel reservation confirmed',
        message:
          `Your hotel reservation ${booking.bookingReference} is confirmed ` +
          `(${booking.rooms.length} room(s), ` +
          `${booking.checkIn.toISOString().slice(0, 10)} to ` +
          `${booking.checkOut.toISOString().slice(0, 10)}, ` +
          `total ${booking.totalPrice} ${booking.currency}).`,
        metadata: {
          bookingId: String(booking._id),
          bookingReference: booking.bookingReference,
          hotelId: String(booking.hotel),
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          rooms: booking.rooms.map((r) => ({
            room: String(r.room),
            adults: r.adults,
            children: r.children,
          })),
          totalPrice: booking.totalPrice,
          currency: booking.currency,
        },
      });
    } catch (error) {
      this.logger.error(
        `Reservation ${String(booking._id)} confirmed but notification failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
