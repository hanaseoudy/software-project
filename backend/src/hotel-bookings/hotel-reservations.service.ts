import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import { paginate, skipFor, PAGE_SIZE } from '../common/pagination/pagination';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Room } from '../hotels/schemas/room.schema';
import {
  ModeratorAssignment,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { BookingType } from '../payments/enums/payment.enums';
import { RefundsService } from '../payments/refunds.service';
import { User } from '../users/schemas/user.schema';
import {
  HotelReservationDto,
  HotelReservationsPageDto,
  HotelReservationsQueryDto,
  MyReservationsPageDto,
  MyReservationsQueryDto,
  ReservationDetailsDto,
  ReservationGroup,
  ReservationSummaryDto,
  ReservationViewStatus,
} from './dto/reservation-views.dto';
import {
  HotelBooking,
  HotelBookingStatus,
} from './schemas/hotel-booking.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

type BookingRow = Omit<HotelBooking, 'bookingReference' | 'policiesAcceptedAt'> & {
  _id: Types.ObjectId;
  bookingReference?: string;
  policiesAcceptedAt?: Date;
  createdAt?: Date;
};
type HotelRow = Pick<Hotel, 'name' | 'address'> & { _id: Types.ObjectId };
type RoomRow = Pick<Room, 'roomNumber' | 'type'> & { _id: Types.ObjectId };
type UserRow = Pick<User, 'firstName' | 'lastName' | 'email'> & {
  _id: Types.ObjectId;
};

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * HTL-20 (a guest's reservations) and HTL-22 (a moderator's hotel reservations).
 *
 * Only real reservations are listed: Confirmed, Completed and Cancelled. A Pending Payment hold and an
 * Expired hold are not reservations (the guest has not paid), so they never appear. A Confirmed stay
 * whose check-out date has passed counts as Completed straight away, even if the hourly job (GEN-11)
 * has not stored that status yet.
 */
@Injectable()
export class HotelReservationsService {
  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignment>,
    private readonly refunds: RefundsService,
  ) {}

  /** Which stored reservations belong to a status (a finished Confirmed stay is Completed). */
  private statusFilter(status: ReservationViewStatus, now: Date) {
    switch (status) {
      case ReservationViewStatus.CONFIRMED:
        return { status: HotelBookingStatus.CONFIRMED, checkOut: { $gt: now } };
      case ReservationViewStatus.COMPLETED:
        return {
          $or: [
            { status: HotelBookingStatus.COMPLETED },
            { status: HotelBookingStatus.CONFIRMED, checkOut: { $lte: now } },
          ],
        };
      default:
        return { status: HotelBookingStatus.CANCELLED };
    }
  }

  private viewStatus(booking: BookingRow, now: Date): string {
    return booking.status === HotelBookingStatus.CONFIRMED &&
      booking.checkOut <= now
      ? HotelBookingStatus.COMPLETED
      : booking.status;
  }

  // ---------------------------------------------------------------- HTL-20

  async listMine(
    userId: string,
    query: MyReservationsQueryDto,
    now: Date = new Date(),
  ): Promise<MyReservationsPageDto> {
    const group = query.group ?? ReservationGroup.UPCOMING;
    const page = query.page ?? 1;
    const owner = { user: new Types.ObjectId(userId) };
    const statusOf: Record<ReservationGroup, ReservationViewStatus> = {
      [ReservationGroup.UPCOMING]: ReservationViewStatus.CONFIRMED,
      [ReservationGroup.PAST]: ReservationViewStatus.COMPLETED,
      [ReservationGroup.CANCELLED]: ReservationViewStatus.CANCELLED,
    };
    const filterOf = (g: ReservationGroup) => ({
      ...owner,
      ...this.statusFilter(statusOf[g], now),
    });

    const sort: Record<string, 1 | -1> =
      group === ReservationGroup.UPCOMING
        ? { checkIn: 1, _id: 1 } // the next stay first
        : group === ReservationGroup.PAST
          ? { checkOut: -1, _id: -1 } // the most recent stay first
          : { updatedAt: -1, _id: -1 }; // the latest cancellation first

    const [bookings, upcoming, past, cancelled] = await Promise.all([
      this.bookingModel
        .find(filterOf(group))
        .sort(sort)
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .lean<BookingRow[]>()
        .exec(),
      this.bookingModel.countDocuments(filterOf(ReservationGroup.UPCOMING)).exec(),
      this.bookingModel.countDocuments(filterOf(ReservationGroup.PAST)).exec(),
      this.bookingModel.countDocuments(filterOf(ReservationGroup.CANCELLED)).exec(),
    ]);

    const items = await this.toSummaries(bookings, now);
    const total = { upcoming, past, cancelled }[group];
    return {
      ...paginate(items, total, page),
      group,
      counts: { upcoming, past, cancelled },
    };
  }

  async getMine(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<ReservationDetailsDto> {
    const notFound = new NotFoundException('Reservation not found');
    if (!isValidObjectId(id)) throw notFound;
    const booking = await this.bookingModel
      .findOne({
        _id: new Types.ObjectId(id),
        user: new Types.ObjectId(userId), // another guest's reservation is a 404, not a 403
        status: {
          $in: [
            HotelBookingStatus.CONFIRMED,
            HotelBookingStatus.COMPLETED,
            HotelBookingStatus.CANCELLED,
          ],
        },
      })
      .lean<BookingRow>()
      .exec();
    if (!booking) throw notFound;

    const [[summary], refund] = await Promise.all([
      this.toSummaries([booking], now),
      // PAY-03: the latest refund of this reservation (null when it was never cancelled or nothing was refunded)
      this.refunds.findByBooking(BookingType.HOTEL, booking._id),
    ]);
    return {
      ...summary,
      createdAt: (booking.createdAt ?? new Date(0)).toISOString(),
      policiesAcceptedAt: booking.policiesAcceptedAt?.toISOString() ?? null,
      refund,
    };
  }

  private async toSummaries(
    bookings: BookingRow[],
    now: Date,
  ): Promise<ReservationSummaryDto[]> {
    if (bookings.length === 0) return [];
    const hotelIds = [...new Set(bookings.map((b) => String(b.hotel)))];
    const roomIds = [
      ...new Set(bookings.flatMap((b) => b.rooms.map((r) => String(r.room)))),
    ];
    const [hotels, rooms] = await Promise.all([
      this.hotelModel
        .find({ _id: { $in: hotelIds } })
        .select('name address')
        .lean<HotelRow[]>()
        .exec(),
      this.roomModel
        .find({ _id: { $in: roomIds } })
        .select('roomNumber type')
        .lean<RoomRow[]>()
        .exec(),
    ]);
    const hotelById = new Map(hotels.map((h) => [String(h._id), h]));
    const roomById = new Map(rooms.map((r) => [String(r._id), r]));

    return bookings.map((b) => {
      const hotel = hotelById.get(String(b.hotel));
      return {
        id: String(b._id),
        bookingReference: b.bookingReference ?? null,
        hotel: {
          id: String(b.hotel),
          name: hotel?.name ?? null,
          address: hotel?.address ?? null,
        },
        rooms: b.rooms.map((r) => {
          const room = roomById.get(String(r.room));
          return {
            roomId: String(r.room),
            roomNumber: room?.roomNumber ?? null,
            type: room?.type ?? null,
            pricePerNight: r.pricePerNight,
            adults: r.adults,
            children: r.children,
          };
        }),
        checkIn: day(b.checkIn),
        checkOut: day(b.checkOut),
        nights: Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / DAY_MS),
        adults: b.rooms.reduce((sum, r) => sum + r.adults, 0),
        children: b.rooms.reduce((sum, r) => sum + r.children, 0),
        totalPrice: b.totalPrice,
        currency: b.currency,
        status: this.viewStatus(b, now),
      };
    });
  }

  // ---------------------------------------------------------------- HTL-22

  async listForHotel(
    hotelId: string,
    query: HotelReservationsQueryDto,
    user: AuthPayload,
    now: Date = new Date(),
  ): Promise<HotelReservationsPageDto> {
    const hotel = isValidObjectId(hotelId)
      ? await this.hotelModel
          .findById(hotelId)
          .select('_id')
          .lean<{ _id: Types.ObjectId }>()
          .exec()
      : null;
    if (!hotel) throw new NotFoundException('Hotel not found');

    const assigned = isValidObjectId(user.sub)
      ? await this.assignmentModel
          .exists({
            moderatorId: new Types.ObjectId(user.sub),
            providerType: ProviderType.HOTEL,
            providerId: hotel._id,
          })
          .exec()
      : null;
    if (!assigned) {
      throw new ForbiddenException('You can only manage your assigned hotel');
    }

    const page = query.page ?? 1;
    const filter = {
      hotel: hotel._id,
      ...(query.status
        ? this.statusFilter(query.status, now)
        : {
            status: {
              $in: [
                HotelBookingStatus.CONFIRMED,
                HotelBookingStatus.COMPLETED,
                HotelBookingStatus.CANCELLED,
              ],
            },
          }),
    };
    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort({ checkIn: -1, _id: -1 }) // latest check-in first
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .lean<BookingRow[]>()
        .exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);

    const guests = bookings.length
      ? await this.userModel
          .find({ _id: { $in: [...new Set(bookings.map((b) => String(b.user)))] } })
          .select('firstName lastName email')
          .lean<UserRow[]>()
          .exec()
      : [];
    const guestById = new Map(guests.map((g) => [String(g._id), g]));

    const items: HotelReservationDto[] = bookings.map((b) => {
      const guest = guestById.get(String(b.user));
      return {
        id: String(b._id),
        bookingReference: b.bookingReference ?? null,
        guest: {
          id: String(b.user),
          name: guest ? `${guest.firstName} ${guest.lastName}`.trim() : null,
          email: guest?.email ?? null,
        },
        checkIn: day(b.checkIn),
        checkOut: day(b.checkOut),
        roomCount: b.rooms.length,
        totalPrice: b.totalPrice,
        status: this.viewStatus(b, now),
      };
    });
    return paginate(items, total, page);
  }
}
