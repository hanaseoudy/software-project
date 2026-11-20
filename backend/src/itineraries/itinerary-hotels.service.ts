import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { HotelSearchService } from '../hotels/hotel-search.service';
import { HotelSearchPageDto } from '../hotels/dto/hotel-search-result.dto';
import { SearchHotelsQueryDto } from '../hotels/dto/search-hotels-query.dto';
import { parseCalendarDate } from '../hotel-bookings/utils/calendar-date';
import { City, CityDocument } from '../reference-data/schemas/city.schema';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import {
  ItineraryDay,
  ItineraryDayDocument,
} from './schemas/itinerary-day.schema';
import { groupConsecutiveDays } from './utils/city-groups';
import { ItineraryHotelSearchQueryDto } from './dto/itinerary-hotel-search-query.dto';

@Injectable()
export class ItineraryHotelsService {
  constructor(
    @InjectModel(Itinerary.name)
    private readonly itineraries: Model<ItineraryDocument>,
    @InjectModel(ItineraryDay.name)
    private readonly days: Model<ItineraryDayDocument>,
    @InjectModel(City.name) private readonly cities: Model<CityDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly hotels: HotelSearchService,
  ) {}

  private objectId(value: string, field: string): Types.ObjectId {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value))
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { [field]: ['Must be a valid MongoDB ID'] },
      });
    return new Types.ObjectId(value);
  }

  async search(
    userId: string,
    itineraryId: string,
    query: ItineraryHotelSearchQueryDto,
  ): Promise<HotelSearchPageDto> {
    const parentId = this.objectId(itineraryId, 'id');
    const firstDayId = this.objectId(query.groupFirstDayId, 'groupFirstDayId');
    let session: ClientSession | undefined;
    let search: SearchHotelsQueryDto;
    try {
      // A read-only snapshot keeps parent dates, day order and city mapping
      // coherent during concurrent ITN-07/08/09 edits. No parent write is needed.
      session = await this.connection.startSession({
        snapshot: true,
        causalConsistency: false,
      });
      const parent = await this.itineraries
        .findOne({ _id: parentId, userId: new Types.ObjectId(userId) })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (!parent)
        throw new NotFoundException('Itinerary or city group not found');
      const days = await this.days
        .find({ itineraryId: parentId })
        .select('_id dayNumber cityId')
        .sort({ dayNumber: 1 })
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (
        days.length > 60 ||
        days.some(
          (day, index) =>
            day.dayNumber !== index + 1 ||
            typeof day.cityId !== 'string' ||
            !day.cityId.trim() ||
            day.cityId !== day.cityId.trim(),
        )
      )
        throw new ConflictException(
          'Existing itinerary day numbering or city is invalid',
        );
      const group = groupConsecutiveDays(days).find((item) =>
        item.days[0]._id.equals(firstDayId),
      );
      if (!group)
        throw new NotFoundException('Itinerary or city group not found');
      const city = await this.cities
        .findOne({ cityId: group.cityId })
        .select('_id cityId name countryCode')
        .session(session)
        .read('primary')
        .maxTimeMS(5000)
        .lean();
      if (
        !city ||
        typeof city.name !== 'string' ||
        !city.name.trim() ||
        !/^[A-Z]{2}$/.test(city.countryCode)
      )
        throw new ConflictException(
          'Existing itinerary day has an invalid city reference',
        );
      // ITN-09 uses a GEN-12 cityId string; HTL-11 searches by the same City's _id.
      const start =
        parent.startDate instanceof Date ? parent.startDate : new Date(NaN);
      if (!Number.isFinite(start.getTime()))
        throw new ConflictException('Existing itinerary start date is invalid');
      const checkIn = new Date(start),
        checkOut = new Date(start);
      checkIn.setUTCDate(checkIn.getUTCDate() + group.days[0].dayNumber - 1);
      checkOut.setUTCDate(
        checkOut.getUTCDate() + group.days[group.days.length - 1].dayNumber,
      );
      const date = (value: Date) => {
        if (!Number.isFinite(value.getTime()))
          throw new ConflictException('Existing itinerary dates are invalid');
        const text = value.toISOString().slice(0, 10);
        if (!parseCalendarDate(text))
          throw new ConflictException(
            'Existing itinerary dates are outside the supported calendar',
          );
        return text;
      };
      search = {
        city: city._id.toString(),
        checkIn: date(checkIn),
        checkOut: date(checkOut),
        guests: query.guests,
        rooms: query.rooms ?? 1,
        page: query.page ?? 1,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        minRating: query.minRating,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (('code' in error && [50, 239, 246].includes(Number(error.code))) ||
          ('name' in error &&
            [
              'MongoNetworkError',
              'MongoNetworkTimeoutError',
              'MongoServerSelectionError',
            ].includes(String(error.name))))
      )
        throw new ServiceUnavailableException(
          'Consistent itinerary snapshot unavailable. Please retry.',
        );
      throw error;
    } finally {
      await session?.endSession();
    }
    // Availability remains HTL-11's responsibility. This is not a reservation,
    // and its reads intentionally retain the existing hotel's consistency model.
    return this.hotels.search(search);
  }
}
