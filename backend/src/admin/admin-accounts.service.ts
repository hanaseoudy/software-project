import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class AdminAccountsService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /** ACC-14: paginated list of all accounts with search by name or email and filters by role and status. */
  async listAccounts(query: ListAccountsQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;

    const words = query.search?.split(/\s+/).filter(Boolean) ?? [];
    if (words.length > 0) {
      filter.$and = words.map((word) => {
        const pattern = new RegExp(escapeRegex(word), 'i');
        return { $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }] };
      });
    }

    const page = query.page ?? 1;
    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .select('firstName lastName email role status createdAt')
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    const items = users.map((user) => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      registeredAt: (user as { createdAt?: Date }).createdAt ?? null,
    }));

    return paginate(items, total, page);
  }
}