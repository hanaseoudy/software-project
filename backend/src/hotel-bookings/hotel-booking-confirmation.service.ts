import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
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
 * HTL-17: after a SUCCESSFUL, already-verified payment, confirm the whole
 * reservation (all its rooms), give it a unique booking reference and send an
 * in-app notification. The payment module (PAY-01) is expected to call
 * confirmAfterPayment() once it has verified the payment outcome.
 */
@Injectable()
export class HotelBookingConfirmationService {
  private readonly logger = new Logger(HotelBookingConfirmationService.name);

  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async confirmAfterPayment(bookingId: string): Promise<HotelBookingDocument> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid reservation id');
    }
    const id = new Types.ObjectId(bookingId);

    const existing = await this.bookingModel.findById(id);
    if (!existing) {
      throw new NotFoundException('Reservation not found');
    }
    // Idempotent: a repeated payment callback must not change anything.
    if (existing.status === HotelBookingStatus.CONFIRMED) {
      return existing;
    }
    if (existing.status !== HotelBookingStatus.PENDING_PAYMENT) {
      throw new ConflictException(
        `Reservation is ${existing.status} and cannot be confirmed`,
      );
    }

    const confirmed = await this.confirmWithUniqueReference(id);
    await this.notifyConfirmed(confirmed);
    return confirmed;
  }

  /** One atomic update: only a still-valid PENDING_PAYMENT hold is confirmed. */
  private async confirmWithUniqueReference(
    id: Types.ObjectId,
  ): Promise<HotelBookingDocument> {
    for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt++) {
      try {
        const confirmed = await this.bookingModel.findOneAndUpdate(
          {
            _id: id,
            status: HotelBookingStatus.PENDING_PAYMENT,
            holdExpiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: HotelBookingStatus.CONFIRMED,
              bookingReference: generateBookingReference(),
            },
          },
          { new: true },
        );
        if (confirmed) return confirmed;

        // Nothing matched: confirmed by a concurrent call, expired, or changed.
        const current = await this.bookingModel.findById(id);
        if (current?.status === HotelBookingStatus.CONFIRMED) return current;
        throw new ConflictException(
          'The hold on this reservation has expired or it is no longer pending payment',
        );
      } catch (error) {
        // Extremely unlikely reference collision: try another reference.
        if (isDuplicateKeyError(error) && attempt < MAX_REFERENCE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not generate a unique booking reference',
    );
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
