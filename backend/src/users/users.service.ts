import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccountStatus, SupportedCurrency, User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.toProfile(user);
  }

  /** ACC-09: the ValidationPipe rejects the whole body if any field is invalid, so nothing is saved partially. */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    if (dto.firstName !== undefined) set.firstName = dto.firstName;
    if (dto.lastName !== undefined) set.lastName = dto.lastName;
    if (dto.phoneNumber === null) unset.phoneNumber = '';
    else if (dto.phoneNumber !== undefined) set.phoneNumber = dto.phoneNumber;
    if (dto.preferredCurrency !== undefined) set['preferences.currency'] = dto.preferredCurrency;

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { body: ['Send at least one of firstName, lastName, phoneNumber, preferredCurrency'] },
      });
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const user = await this.userModel.findOneAndUpdate({ _id: userId, status: AccountStatus.ACTIVE }, update, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.toProfile(user);
  }

  private toProfile(user: UserDocument) {
    return {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      role: user.role,
      preferredCurrency: user.preferences?.currency ?? SupportedCurrency.EGP,
    };
  }
}