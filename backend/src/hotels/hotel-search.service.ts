import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { paginate, PAGE_SIZE, skipFor } from '../common/pagination/pagination';
import {
  HotelBooking,
  HotelBookingStatus,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { parseCalendarDate } from '../hotel-bookings/utils/calendar-date';
import { isStayFullyAvailable } from '../hotel-bookings/utils/stay-availability';
import {
  HotelSearchPageDto,
  HotelSearchResultDto,
} from './dto/hotel-search-result.dto';
import { SearchHotelsQueryDto } from './dto/search-hotels-query.dto';
import { Hotel } from './schemas/hotel.schema';
import {
  AvailabilityType,
  RoomAvailability,
} from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';

type HotelRow = Hotel & { _id: Types.ObjectId };
type RoomRow = Pick<Room, 'hotel' | 'maxOccupancy' | 'pricePerNight'> & {
  _id: Types.ObjectId;
};
type RangeRow = Pick<
  RoomAvailability,
  'room' | 'type' | 'startDate' | 'endDate'
>;
type BookingRow = { rooms: { room: Types.ObjectId }[] };

/** HTL-11: hotel search by destination, dates and occupancy. Public (no login needed). */
@Injectable()
export class HotelSearchService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailability>,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
  ) {}

  async search(
    query: SearchHotelsQueryDto,
    now: Date = new Date(),
  ): Promise<HotelSearchPageDto> {
    const { checkIn, checkOut } = this.validate(query, now);
    const guests = query.guests;
    const roomsWanted = query.rooms ?? 1;
    const page = query.page ?? 1;

    const hotels = await this.hotelModel
      .find({
        isActive: true,
        ...(query.city ? { city: query.city } : {}),
        ...(query.country ? { country: query.country } : {}),
      })
      .sort({ name: 1, _id: 1 })
      .lean<HotelRow[]>()
      .exec();
    if (hotels.length === 0) {
      return paginate([], 0, page);
    }

    const rooms = await this.roomModel
      .find({ hotel: { $in: hotels.map((h) => h._id) }, isActive: true })
      .select('hotel maxOccupancy pricePerNight')
      .lean<RoomRow[]>()
      .exec();
    const roomIds = rooms.map((r) => r._id);

    // Bookable and blocked ranges that touch the stay (both days of a range are included).
    const ranges = roomIds.length
      ? await this.availabilityModel
          .find({
            room: { $in: roomIds },
            startDate: { $lt: checkOut },
            endDate: { $gte: checkIn },
          })
          .lean<RangeRow[]>()
          .exec()
      : [];

    // A Confirmed stay, or a Pending Payment hold that has not expired (HTL-18), takes the room.
    const bookings = roomIds.length
      ? await this.bookingModel
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
          .exec()
      : [];

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

    const freeByHotel = new Map<string, RoomRow[]>();
    for (const room of rooms) {
      const key = String(room._id);
      const free =
        !blockedRooms.has(key) &&
        !bookedRooms.has(key) &&
        isStayFullyAvailable(checkIn, checkOut, bookableByRoom.get(key) ?? []);
      if (free) {
        const hotelKey = String(room.hotel);
        freeByHotel.set(hotelKey, [...(freeByHotel.get(hotelKey) ?? []), room]);
      }
    }

    const matches: HotelSearchResultDto[] = [];
    for (const hotel of hotels) {
      const free = freeByHotel.get(String(hotel._id)) ?? [];
      if (free.length < roomsWanted) {
        continue;
      }
      // The best case for the guests is the largest rooms, so check those.
      const capacity = [...free]
        .sort((a, b) => b.maxOccupancy - a.maxOccupancy)
        .slice(0, roomsWanted)
        .reduce((sum, room) => sum + room.maxOccupancy, 0);
      if (capacity < guests) {
        continue;
      }
      matches.push({
        id: String(hotel._id),
        name: hotel.name,
        address: hotel.address,
        city: String(hotel.city),
        country: String(hotel.country),
        starRating: hotel.starRating,
        image: hotel.images?.[0] ?? null,
        averageRating: hotel.averageRating,
        reviewCount: hotel.reviewCount,
        availableRooms: free.length,
        lowestPricePerNight: Math.min(...free.map((r) => r.pricePerNight)),
      });
    }

    const start = skipFor(page);
    return paginate(
      matches.slice(start, start + PAGE_SIZE),
      matches.length,
      page,
    );
  }

  private validate(
    query: SearchHotelsQueryDto,
    now: Date,
  ): { checkIn: Date; checkOut: Date } {
    const errors: Record<string, string[]> = {};
    if (!query.city && !query.country) {
      errors.destination = ['Choose a city or a country'];
    }

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
