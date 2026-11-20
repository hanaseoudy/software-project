import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airline } from '../airlines/schemas/airline.schema';
import { PLATFORM_CURRENCY } from '../common/constants/currency.constants';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema';
import { Flight } from '../flights/schemas/flight.schema';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { AdminBookingType } from './dto/list-bookings-query.dto';
import { ProviderAnalyticsQueryDto } from './dto/provider-analytics-query.dto';
import { createdAtRange } from './utils/booking-overview';
import {
  ANALYTICS_STATUSES,
  buildProviderStats,
  byRevenue,
  summarize,
} from './utils/provider-analytics';
import type { ProviderStats, StatusGroup } from './utils/provider-analytics';

/**
 * BON-01: read-only analytics for admins: bookings and revenue per provider
 * (airline or hotel) over a selected period. Nothing here changes data.
 *
 * - The period filters the date the booking was created (same as ACC-17).
 * - Bookings and revenue count confirmed and completed bookings only. Cancelled
 *   bookings are shown separately and are not counted as revenue.
 * - A flight booking belongs to the airline of its outbound flight.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(FlightBooking.name)
    private readonly flightBookingModel: Model<FlightBooking>,
    @InjectModel(HotelBooking.name)
    private readonly hotelBookingModel: Model<HotelBooking>,
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
  ) {}

  async providerAnalytics(query: ProviderAnalyticsQueryDto) {
    const page = query.page ?? 1;

    const match: Record<string, unknown> = {
      status: { $in: [...ANALYTICS_STATUSES] },
    };
    try {
      const range = createdAtRange(query.from, query.to);
      if (range) match.createdAt = range;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid date range',
      );
    }

    const [airlines, hotels] = await Promise.all([
      query.type === AdminBookingType.HOTEL ? [] : this.airlineStats(match),
      query.type === AdminBookingType.FLIGHT ? [] : this.hotelStats(match),
    ]);

    const providers = [...airlines, ...hotels].sort(byRevenue);
    const start = skipFor(page);
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      currency: PLATFORM_CURRENCY,
      summary: summarize(providers),
      ...paginate(
        providers.slice(start, start + PAGE_SIZE),
        providers.length,
        page,
      ),
    };
  }

  private async airlineStats(
    match: Record<string, unknown>,
  ): Promise<ProviderStats[]> {
    const groups = await this.flightBookingModel.aggregate<StatusGroup>([
      { $match: match },
      {
        $lookup: {
          from: this.flightModel.collection.name,
          localField: 'outboundFlight',
          foreignField: '_id',
          as: 'outbound',
          pipeline: [{ $project: { airline: 1 } }],
        },
      },
      {
        $group: {
          _id: {
            provider: { $arrayElemAt: ['$outbound.airline', 0] },
            status: '$status',
          },
          count: { $sum: 1 },
          // Same amount PAY-01 charges: seat fares + baggage fees.
          amount: {
            $sum: { $add: ['$totalPrice', { $ifNull: ['$baggageFees', 0] }] },
          },
        },
      },
    ]);
    const names = await this.namesOf(this.airlineModel, groups);
    return buildProviderStats('airline', groups, names);
  }

  private async hotelStats(
    match: Record<string, unknown>,
  ): Promise<ProviderStats[]> {
    const groups = await this.hotelBookingModel.aggregate<StatusGroup>([
      { $match: match },
      {
        $group: {
          _id: { provider: '$hotel', status: '$status' },
          count: { $sum: 1 },
          amount: { $sum: '$totalPrice' },
        },
      },
    ]);
    const names = await this.namesOf(this.hotelModel, groups);
    return buildProviderStats('hotel', groups, names);
  }

  private async namesOf(
    model: Model<Airline> | Model<Hotel>,
    groups: StatusGroup[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        groups.flatMap((g) =>
          g._id.provider == null ? [] : [String(g._id.provider)],
        ),
      ),
    ];
    if (!ids.length) return new Map();
    const found = await (model as unknown as Model<{ name: string }>)
      .find({ _id: { $in: ids } })
      .select('name')
      .lean();
    return new Map(found.map((p) => [String(p._id), p.name]));
  }
}
