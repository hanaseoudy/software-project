import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Airline } from '../airlines/schemas/airline.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification.enums';

/**
 * ACC-15: an inactive hotel or airline is hidden from search and cannot be booked
 * (hotel search, hotel details and hotel/flight booking all check isActive).
 * Existing Confirmed bookings are not touched.
 */
@Injectable()
export class AdminProvidersService {
  private readonly logger = new Logger(AdminProvidersService.name);

  constructor(
    @InjectModel(Hotel.name) private hotelModel: Model<Hotel>,
    @InjectModel(Airline.name) private airlineModel: Model<Airline>,
    @InjectModel(ModeratorAssignment.name) private assignmentModel: Model<ModeratorAssignmentDocument>,
    private notificationsService: NotificationsService,
  ) {}

  deactivateProvider(type: ProviderType, id: string) {
    return this.setActive(type, id, false);
  }

  reactivateProvider(type: ProviderType, id: string) {
    return this.setActive(type, id, true);
  }

  private async setActive(type: ProviderType, id: string, active: boolean) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid provider ID');
    }

    const label = type === ProviderType.HOTEL ? 'Hotel' : 'Airline';
    const model = (type === ProviderType.HOTEL ? this.hotelModel : this.airlineModel) as unknown as Model<{
      name: string;
      isActive?: boolean;
    }>;

    const provider = await model.findById(id).select('name isActive').lean();
    if (!provider) {
      throw new NotFoundException(`${label} not found`);
    }
    // older documents may not have the field yet; they count as active
    if ((provider.isActive !== false) === active) {
      throw new ConflictException(`${label} is already ${active ? 'active' : 'deactivated'}`);
    }

    const result = await model.updateOne(
      { _id: provider._id, isActive: active ? false : { $ne: false } },
      { $set: { isActive: active } },
    );
    if (result.modifiedCount === 0) {
      throw new ConflictException(`${label} status changed, please try again`);
    }

    await this.notifyModerators(type, provider._id, provider.name, active);

    return { id: provider._id, type, name: provider.name, isActive: active };
  }

  /** The moderators assigned to this provider are the affected parties. */
  private async notifyModerators(type: ProviderType, providerId: Types.ObjectId, name: string, active: boolean) {
    try {
      const assignments = await this.assignmentModel
        .find({ providerId, providerType: type })
        .select('moderatorId')
        .lean();

      await this.notificationsService.createForMany(
        assignments.map((a) => a.moderatorId),
        active
          ? {
              type: NotificationType.PROVIDER_REACTIVATED,
              title: `${name} reactivated`,
              message: `${name} has been reactivated by an administrator. Its listings are visible and bookable again.`,
              metadata: { providerType: type, providerId },
            }
          : {
              type: NotificationType.PROVIDER_SUSPENDED,
              title: `${name} deactivated`,
              message: `${name} has been deactivated by an administrator. Its listings are hidden and cannot be booked. Existing confirmed bookings stay valid.`,
              metadata: { providerType: type, providerId },
            },
      );
    } catch (err) {
      this.logger.warn(`Could not notify moderators of ${type} ${String(providerId)}: ${String(err)}`);
    }
  }
}