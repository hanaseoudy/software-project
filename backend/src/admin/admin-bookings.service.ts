import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import {
  AdminBookingType,
  ListBookingsQueryDto,
} from './dto/list-bookings-query.dto';
import {
  createdAtRange,
  newestFirst,
  toFlightRow,
  toHotelRow,
} from './utils/booking-overview';
import type {
  FlightBookingLean,
  HotelBookingLean,
  OverviewRow,
} from './utils/booking-overview';

const USER_FIELDS = 'firstName lastName email';

/**
 * ACC-17: read-only overview of all flight bookings and hotel reservations for
 * admins. Nothing here changes a booking.
 */
@Injectable()
export class AdminBookingsService {
  constructor(
    @InjectModel(FlightBooking.name)
    private readonly flightBookingModel: Model<FlightBooking>,
    @InjectModel(HotelBooking.name)
    private readonly hotelBookingModel: Model<HotelBooking>,
  ) {}

  async listBookings(query: ListBookingsQueryDto) {
    const page = query.page ?? 1;

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    try {
      const range = createdAtRange(query.from, query.to);
      if (range) filter.createdAt = range;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid date range',
      );
    }

    const wantFlights = query.type !== AdminBookingType.HOTEL;
    const wantHotels = query.type !== AdminBookingType.FLIGHT;
    // The newest `take` rows of each type always contain the requested page of the merged list.
    const take = page * PAGE_SIZE;

    const [flights, flightTotal, hotels, hotelTotal] = await Promise.all([
      wantFlights ? this.findFlights(filter, take) : [],
      wantFlights ? this.flightBookingModel.countDocuments(filter) : 0,
      wantHotels ? this.findHotels(filter, take) : [],
      wantHotels ? this.hotelBookingModel.countDocuments(filter) : 0,
    ]);

    const rows: OverviewRow[] = [
      ...flights.map(toFlightRow),
      ...hotels.map(toHotelRow),
    ].sort(newestFirst);

    const start = skipFor(page);
    return paginate(
      rows.slice(start, start + PAGE_SIZE),
      flightTotal + hotelTotal,
      page,
    );
  }

  private findFlights(filter: Record<string, unknown>, take: number) {
    return this.flightBookingModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(take)
      .populate('user', USER_FIELDS)
      .populate({
        path: 'outboundFlight',
        select: 'airline departureTime arrivalTime',
        populate: { path: 'airline', select: 'name' },
      })
      .populate({
        path: 'returnFlight',
        select: 'airline arrivalTime',
        populate: { path: 'airline', select: 'name' },
      })
      .lean<FlightBookingLean[]>();
  }

  private findHotels(filter: Record<string, unknown>, take: number) {
    return this.hotelBookingModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(take)
      .populate('user', USER_FIELDS)
      .populate('hotel', 'name')
      .lean<HotelBookingLean[]>();
  }
}
