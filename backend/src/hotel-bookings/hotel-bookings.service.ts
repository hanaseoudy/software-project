import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Room } from '../hotels/schemas/room.schema';
import {
  AvailabilityType,
  RoomAvailability,
} from '../hotels/schemas/room-availability.schema';
import { HoldHotelBookingDto } from './dto/hold-hotel-booking.dto';
import {
  HotelBooking,
  HotelBookingDocument,
  HotelBookingStatus,
} from './schemas/hotel-booking.schema';
import { RoomLock } from './schemas/room-lock.schema';

export const HOLD_DURATION_MS = 10 * 60 * 1000; // HTL-18: 10-minute hold
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class HotelBookingsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(RoomLock.name) private readonly lockModel: Model<RoomLock>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomAvailability.name)
    private readonly availabilityModel: Model<RoomAvailability>,
  ) {}

  /**
   * HTL-18: hold all selected rooms together for 10 minutes as ONE
   * PENDING_PAYMENT reservation. If any room is unavailable the whole
   * request is rejected and nothing is held.
   */
  async createHold(
    userId: string,
    dto: HoldHotelBookingDto,
  ): Promise<HotelBookingDocument> {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    checkIn.setUTCHours(0, 0, 0, 0);
    checkOut.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }
    if (checkIn < today) {
      throw new BadRequestException('checkIn cannot be in the past');
    }

    const roomIds = dto.rooms.map((r) => r.roomId);
    if (new Set(roomIds).size !== roomIds.length) {
      throw new BadRequestException('Each room can be selected only once');
    }

    // HTL-16: at least one adult per reservation (not per room)
    if (dto.rooms.reduce((sum, r) => sum + r.adults, 0) < 1) {
      throw new BadRequestException('At least one adult is required per reservation');
    }

    const hotel = await this.hotelModel.findById(dto.hotelId).lean();
    if (!hotel || !hotel.isActive) {
      throw new NotFoundException('Hotel not found or not available');
    }

    const rooms = await this.roomModel.find({ _id: { $in: roomIds } }).lean();
    if (rooms.length !== roomIds.length) {
      throw new NotFoundException('One or more rooms were not found');
    }

    const requested = new Map(dto.rooms.map((r) => [r.roomId, r]));
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
    let totalPrice = 0;
    const bookedRooms = rooms.map((room) => {
      if (String(room.hotel) !== dto.hotelId || !room.isActive) {
        throw new BadRequestException(
          `Room ${room.roomNumber} is not available in this hotel`,
        );
      }
      const guests = requested.get(String(room._id))!;
      if (guests.adults + guests.children > room.maxOccupancy) {
        throw new BadRequestException(
          `Room ${room.roomNumber} allows at most ${room.maxOccupancy} guests`,
        );
      }
      totalPrice += room.pricePerNight * nights;
      return {
        room: room._id,
        pricePerNight: room.pricePerNight,
        adults: guests.adults,
        children: guests.children,
      };
    });

    const roomObjectIds = roomIds.map((id) => new Types.ObjectId(id));

    // Make sure a lock document exists for every room (outside the transaction).
    await this.lockModel.bulkWrite(
      roomObjectIds.map((room) => ({
        updateOne: {
          filter: { room },
          update: { $setOnInsert: { version: 0 } },
          upsert: true,
        },
      })),
    );

    const session = await this.connection.startSession();
    let booking: HotelBookingDocument | undefined;
    try {
      await session.withTransaction(async () => {
        // 1) Touch the lock of every room (sorted) so concurrent holds on the
        //    same rooms conflict and are serialized.
        for (const id of [...roomIds].sort()) {
          await this.lockModel.updateOne(
            { room: new Types.ObjectId(id) },
            { $inc: { version: 1 } },
            { session },
          );
        }

        // 2) Blocked ranges
        const blocked = await this.availabilityModel
          .exists({
            room: { $in: roomObjectIds },
            type: AvailabilityType.BLOCKED,
            startDate: { $lt: checkOut },
            endDate: { $gte: checkIn },
          })
          .session(session);
        if (blocked) {
          throw new ConflictException(
            'One or more rooms are blocked for the selected dates',
          );
        }

        // 3) Confirmed reservations or unexpired holds that overlap
        const overlap = await this.bookingModel
          .exists({
            'rooms.room': { $in: roomObjectIds },
            checkIn: { $lt: checkOut },
            checkOut: { $gt: checkIn },
            $or: [
              { status: HotelBookingStatus.CONFIRMED },
              {
                status: HotelBookingStatus.PENDING_PAYMENT,
                holdExpiresAt: { $gt: new Date() },
              },
            ],
          })
          .session(session);
        if (overlap) {
          throw new ConflictException(
            'One or more rooms are already reserved for the selected dates',
          );
        }

        // 4) Create the single PENDING_PAYMENT reservation
        const [created] = await this.bookingModel.create(
          [
            {
              user: new Types.ObjectId(userId),
              hotel: new Types.ObjectId(dto.hotelId),
              rooms: bookedRooms,
              checkIn,
              checkOut,
              totalPrice: Math.round(totalPrice * 100) / 100,
              status: HotelBookingStatus.PENDING_PAYMENT,
              holdExpiresAt: new Date(Date.now() + HOLD_DURATION_MS),
            },
          ],
          { session },
        );
        booking = created;
      });
    } finally {
      await session.endSession();
    }

    return booking!;
  }
}
