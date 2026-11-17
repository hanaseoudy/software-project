import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { paginate, PAGE_SIZE, skipFor } from '../common/pagination/pagination';
import {
  HotelBooking,
  HotelBookingStatus,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { parseCalendarDate } from '../hotel-bookings/utils/calendar-date';
import { isStayFullyAvailable } from '../hotel-bookings/utils/stay-availability';
import { AvailableRoomsQueryDto } from './dto/available-rooms-query.dto';
import {
  AvailableRoomDto,
  AvailableRoomsPageDto,
} from './dto/available-room.dto';
import { Hotel } from './schemas/hotel.schema';
import {
  AvailabilityType,
  RoomAvailability,
} from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

type RoomRow = Pick<
  Room,
  'roomNumber' | 'type' | 'beds' | 'maxOccupancy' | 'pricePerNight' | 'currency'
> & { _id: Types.ObjectId };
type RangeRow = Pick<
  RoomAvailability,
  'room' | 'type' | 'startDate' | 'endDate'
>;
type BookingRow = { rooms: { room: Types.ObjectId }[] };

/**
 * HTL-15: the rooms of one hotel that are free for the whole searched stay, with the total
 * stay price. Public (no login needed). A room is free when it is active, not blocked, not
 * taken by a Confirmed stay or an unexpired Pending Payment hold (HTL-18), and the whole stay
 * falls inside its bookable ranges (HTL-04).
 */
@Injectable()
export class HotelRoomAvailabilityService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailability>,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
  ) {}

  async findAvailable(
    hotelId: string,
    query: AvailableRoomsQueryDto,
    now: Date = new Date(),
  ): Promise<AvailableRoomsPageDto> {
    if (!isValidObjectId(hotelId)) {
      throw new NotFoundException('Hotel not found');
    }
    const hotel = await this.hotelModel
      .findOne({ _id: hotelId, isActive: true })
      .select('_id')
      .lean()
      .exec();
    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    const { checkIn, checkOut } = this.validate(query, now);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
    const page = query.page ?? 1;

    const rooms = await this.roomModel
      .find({ hotel: hotel._id, isActive: true })
      .select('roomNumber type beds maxOccupancy pricePerNight currency')
      .sort({ roomNumber: 1, _id: 1 })
      .lean<RoomRow[]>()
      .exec();
    if (rooms.length === 0) {
      return paginate([], 0, page);
    }
    const roomIds = rooms.map((r) => r._id);

    // Bookable and blocked ranges that touch the stay (both days of a range are included).
    const ranges = await this.availabilityModel
      .find({
        room: { $in: roomIds },
        startDate: { $lt: checkOut },
        endDate: { $gte: checkIn },
      })
      .lean<RangeRow[]>()
      .exec();

    // A Confirmed stay, or a Pending Payment hold that has not expired (HTL-18), takes the room.
    const bookings = await this.bookingModel
      .find({
        'rooms.room': { $in: roomIds },
        $or: [
          { status: HotelBookingStatus.CONFIRMED },
          {
            status: HotelBookingStatus.PENDING_PAYMENT,
            holdExpiresAt: { $gt: now },
          },
        ],
        checkIn: { $lt: checkOut },
        checkOut: { $gt: checkIn },
      })
      .select('rooms.room')
      .lean<BookingRow[]>()
      .exec();

    const bookableByRoom = new Map<string, RangeRow[]>();
    const blockedRooms = new Set<string>();
    for (const range of ranges) {
      const key = String(range.room);
      if (range.type === AvailabilityType.BLOCKED) {
        blockedRooms.add(key);
      } else {
        bookableByRoom.set(key, [...(bookableByRoom.get(key) ?? []), range]);
      }
    }
    const bookedRooms = new Set(
      bookings.flatMap((b) => b.rooms.map((r) => String(r.room))),
    );

    const free: AvailableRoomDto[] = [];
    for (const room of rooms) {
      const key = String(room._id);
      const isFree =
        !blockedRooms.has(key) &&
        !bookedRooms.has(key) &&
        isStayFullyAvailable(checkIn, checkOut, bookableByRoom.get(key) ?? []);
      if (!isFree) {
        continue;
      }
      free.push({
        id: key,
        roomNumber: room.roomNumber,
        type: room.type,
        beds: room.beds,
        maxOccupancy: room.maxOccupancy,
        pricePerNight: room.pricePerNight,
        currency: room.currency,
        nights,
        // Rounded to cents so 3 x 33.33 does not show as 99.99000000000001.
        totalStayPrice: Math.round(nights * room.pricePerNight * 100) / 100,
      });
    }

    const start = skipFor(page);
    return paginate(free.slice(start, start + PAGE_SIZE), free.length, page);
  }

  private validate(
    query: AvailableRoomsQueryDto,
    now: Date,
  ): { checkIn: Date; checkOut: Date } {
    const errors: Record<string, string[]> = {};
    const checkIn = parseCalendarDate(query.checkIn);
    const checkOut = parseCalendarDate(query.checkOut);
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    if (!checkIn) {
      errors.checkIn = ['Check-in must be a real date in YYYY-MM-DD format'];
    } else if (checkIn < today) {
      errors.checkIn = ['Check-in cannot be in the past'];
    }
    if (!checkOut) {
      errors.checkOut = ['Check-out must be a real date in YYYY-MM-DD format'];
    } else if (checkIn && checkOut <= checkIn) {
      errors.checkOut = ['Check-out must be after check-in'];
    }

    if (!checkIn || !checkOut || Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
    return { checkIn, checkOut };
  }
}
