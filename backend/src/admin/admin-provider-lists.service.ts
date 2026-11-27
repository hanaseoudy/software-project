import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Airline } from '../airlines/schemas/airline.schema';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { AdminAirlinesPageDto, AdminHotelsPageDto } from './dto/provider-list.dto';

type ProviderRow = { _id: Types.ObjectId; name: string; code?: string; isActive?: boolean };

/**
 * ACC-13 / ACC-15: admin lists of all airlines and hotels, active and deactivated,
 * so the admin can link a new moderator to one and deactivate or reactivate them.
 */
@Injectable()
export class AdminProviderListsService {
  constructor(
    @InjectModel(Hotel.name) private hotelModel: Model<Hotel>,
    @InjectModel(Airline.name) private airlineModel: Model<Airline>,
  ) {}

  async listAirlines(page = 1): Promise<AdminAirlinesPageDto> {
    const [rows, total] = await Promise.all([
      this.airlineModel
        .find()
        .sort({ name: 1, _id: 1 })
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .select('name code isActive')
        .lean<ProviderRow[]>()
        .exec(),
      this.airlineModel.countDocuments().exec(),
    ]);

    const items = rows.map((row) => ({
      id: row._id.toString(),
      name: row.name,
      code: row.code ?? '',
      // older documents may not have the field yet; they count as active
      isActive: row.isActive !== false,
    }));
    return paginate(items, total, page);
  }

  async listHotels(page = 1): Promise<AdminHotelsPageDto> {
    const [rows, total] = await Promise.all([
      this.hotelModel
        .find()
        .sort({ name: 1, _id: 1 })
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .select('name isActive')
        .lean<ProviderRow[]>()
        .exec(),
      this.hotelModel.countDocuments().exec(),
    ]);

    const items = rows.map((row) => ({
      id: row._id.toString(),
      name: row.name,
      isActive: row.isActive !== false,
    }));
    return paginate(items, total, page);
  }
}