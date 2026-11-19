import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { Hotel } from '../hotels/schemas/hotel.schema';
import {
  Itinerary,
  ItineraryVisibility,
} from '../itineraries/schemas/itinerary.schema';
import { FavouritesQueryDto } from './dto/favourites-query.dto';
import { Favourite, FavouriteType } from './schemas/favourite.schema';

interface HotelLean {
  _id: Types.ObjectId;
  name: string;
  starRating: number;
  averageRating: number;
  images?: string[];
  isActive?: boolean;
}

interface ItineraryLean {
  _id: Types.ObjectId;
  title: string;
  countryIds: string[];
  startDate: Date;
  visibility?: string;
  isHidden?: boolean;
}

/**
 * BON-02: a registered user saves hotels and public itineraries to a
 * favourites list and views it. Only available items can be added; if an item
 * later becomes unavailable (hotel deactivated, itinerary made private or
 * hidden) it stays in the list, without its details, so the user can remove it.
 */
@Injectable()
export class FavouritesService {
  constructor(
    @InjectModel(Favourite.name)
    private readonly favouriteModel: Model<Favourite>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<Itinerary>,
  ) {}

  /** Adds an item; adding it again changes nothing (created: false). */
  async add(userId: string, typeParam: string, idParam: string) {
    const { type, id } = this.parse(typeParam, idParam);
    await this.requireAvailable(type, id);

    const result = await this.favouriteModel.updateOne(
      { user: new Types.ObjectId(userId), itemType: type, item: id },
      {
        $setOnInsert: {
          user: new Types.ObjectId(userId),
          itemType: type,
          item: id,
        },
      },
      { upsert: true },
    );
    return {
      type,
      id: String(id),
      favourite: true,
      created: result.upsertedCount === 1,
    };
  }

  async remove(userId: string, typeParam: string, idParam: string) {
    const { type, id } = this.parse(typeParam, idParam);
    const result = await this.favouriteModel.deleteOne({
      user: new Types.ObjectId(userId),
      itemType: type,
      item: id,
    });
    if (result.deletedCount !== 1) {
      throw new NotFoundException('Favourite not found');
    }
    return { type, id: String(id), favourite: false };
  }

  /** The user's favourites, newest first, 10 per page (GEN-05). */
  async list(userId: string, query: FavouritesQueryDto) {
    const page = query.page ?? 1;
    const filter: Record<string, unknown> = {
      user: new Types.ObjectId(userId),
    };
    if (query.type) filter.itemType = query.type;

    const [favourites, total] = await Promise.all([
      this.favouriteModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .lean(),
      this.favouriteModel.countDocuments(filter),
    ]);

    const idsOf = (type: FavouriteType) =>
      favourites.filter((f) => f.itemType === type).map((f) => f.item);
    const [hotels, itineraries] = await Promise.all([
      idsOf(FavouriteType.HOTEL).length
        ? this.hotelModel
            .find({ _id: { $in: idsOf(FavouriteType.HOTEL) } })
            .select('name starRating averageRating images isActive')
            .lean<HotelLean[]>()
        : [],
      idsOf(FavouriteType.ITINERARY).length
        ? this.itineraryModel
            .find({ _id: { $in: idsOf(FavouriteType.ITINERARY) } })
            .select('title countryIds startDate visibility isHidden')
            .lean<ItineraryLean[]>()
        : [],
    ]);
    const hotelById = new Map(hotels.map((h) => [String(h._id), h]));
    const itineraryById = new Map(itineraries.map((i) => [String(i._id), i]));

    const items = favourites.map((f) => {
      const base = {
        type: f.itemType,
        id: String(f.item),
        favouritedAt: (f as { createdAt?: Date }).createdAt,
      };
      if (f.itemType === FavouriteType.HOTEL) {
        const hotel = hotelById.get(String(f.item));
        if (!hotel || hotel.isActive === false) {
          return { ...base, available: false };
        }
        return {
          ...base,
          available: true,
          name: hotel.name,
          starRating: hotel.starRating,
          averageRating: hotel.averageRating,
          image: hotel.images?.[0] ?? null,
        };
      }
      const itinerary = itineraryById.get(String(f.item));
      if (
        !itinerary ||
        itinerary.visibility !== ItineraryVisibility.PUBLIC ||
        itinerary.isHidden === true
      ) {
        // No details: it may be private now.
        return { ...base, available: false };
      }
      return {
        ...base,
        available: true,
        title: itinerary.title,
        countryIds: itinerary.countryIds,
        startDate: itinerary.startDate,
      };
    });

    return paginate(items, total, page);
  }

  private parse(typeParam: string, idParam: string) {
    if (!Object.values(FavouriteType).includes(typeParam as FavouriteType)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { type: ['Type must be hotel or itinerary'] },
      });
    }
    if (!Types.ObjectId.isValid(idParam)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { id: ['ID must be a valid ID'] },
      });
    }
    return {
      type: typeParam as FavouriteType,
      id: new Types.ObjectId(idParam),
    };
  }

  /** Only active hotels and Public, non-hidden itineraries (same rules as HTL-02 / ITN-20). */
  private async requireAvailable(type: FavouriteType, id: Types.ObjectId) {
    const found =
      type === FavouriteType.HOTEL
        ? await this.hotelModel.exists({ _id: id, isActive: true })
        : await this.itineraryModel.exists({
            _id: id,
            visibility: ItineraryVisibility.PUBLIC,
            isHidden: { $ne: true },
          });
    if (!found) {
      throw new NotFoundException(
        type === FavouriteType.HOTEL
          ? 'Hotel not found'
          : 'Itinerary not found',
      );
    }
  }
}
