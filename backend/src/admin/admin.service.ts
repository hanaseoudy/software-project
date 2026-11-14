import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AccountStatus, User, UserDocument, UserRole } from '../users/schemas/user.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Airline } from '../airlines/schemas/airline.schema';
import { CreateModeratorDto } from './dto/create-moderator.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ModeratorAssignment.name) private assignmentModel: Model<ModeratorAssignmentDocument>,
    @InjectModel(Hotel.name) private hotelModel: Model<Hotel>,
    @InjectModel(Airline.name) private airlineModel: Model<Airline>,
  ) {}

  async createModerator(dto: CreateModeratorDto) {
    await this.assertProviderExists(dto.providerType, dto.providerId);

    if (await this.userModel.exists({ email: dto.email })) {
      throw this.emailTaken();
    }

    let user: UserDocument;
    try {
      user = await this.userModel.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.temporaryPassword, 10),
        role: UserRole.MODERATOR,
        status: AccountStatus.ACTIVE,
        mustChangePassword: true,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw this.emailTaken();
      }
      throw err;
    }

    try {
      await this.assignmentModel.create({
        moderatorId: user._id,
        providerId: dto.providerId,
        providerType: dto.providerType,
      });
    } catch (err) {
      await this.userModel.deleteOne({ _id: user._id });
      throw err;
    }

    return {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      providerType: dto.providerType,
      providerId: dto.providerId,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async assertProviderExists(providerType: ProviderType, providerId: string) {
    const exists =
      providerType === ProviderType.HOTEL
        ? await this.hotelModel.exists({ _id: providerId })
        : await this.airlineModel.exists({ _id: providerId });

    if (!exists) {
      throw new NotFoundException(providerType === ProviderType.HOTEL ? 'Hotel not found' : 'Airline not found');
    }
  }

  private emailTaken() {
    return new ConflictException({
      message: 'Validation failed',
      errors: { email: ['Email is already registered'] },
    });
  }
}