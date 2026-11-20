import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AccountStatus, User, UserDocument, UserRole } from '../users/schemas/user.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Airline } from '../airlines/schemas/airline.schema';
import { Session, SessionDocument } from '../auth/schemas/session.schema';
import { MailService } from '../mail/mail.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification.enums';
import { AuditEntryInput, AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction, AuditTargetType } from '../audit-logs/enums/audit-log.enums';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ModeratorAssignment.name) private assignmentModel: Model<ModeratorAssignmentDocument>,
    @InjectModel(Hotel.name) private hotelModel: Model<Hotel>,
    @InjectModel(Airline.name) private airlineModel: Model<Airline>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private notificationsService: NotificationsService,
    private readonly mail: MailService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async createModerator(dto: CreateModeratorDto, adminId?: string) {
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

    // GEN-07: never the email or the temporary password
    this.audit({
      actorId: adminId ?? '',
      action: AuditAction.MODERATOR_CREATED,
      targetType: AuditTargetType.ACCOUNT,
      targetId: user._id,
      details: { providerType: dto.providerType, providerId: dto.providerId },
    });

    // GEN-01-B: invitation email (sent in the background; never includes the temporary password).
    void this.sendInvitation(user, dto);

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

  /** ACC-07a: set a temporary password; the account must change it at its next login (ACC-08). */
  async resetPassword(userId: string, dto: ResetPasswordDto, adminId?: string) {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException("An admin's password cannot be reset here");
    }

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: await bcrypt.hash(dto.temporaryPassword, 10),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      },
    );

    // GEN-07: only the target account id, never the temporary password
    this.audit({
      actorId: adminId ?? '',
      action: AuditAction.PASSWORD_RESET,
      targetType: AuditTargetType.ACCOUNT,
      targetId: user._id,
    });

    await this.sessionModel.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    return {
      id: user._id,
      email: user.email,
      role: user.role,
      mustChangePassword: true,
    };
  }

  /** ACC-16 (users), ACC-15 (moderators): a suspended account cannot log in; bookings and content are untouched. */
  async suspendAccount(userId: string, adminId?: string) {
    const user = await this.findManagedAccount(userId, 'suspended');

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ConflictException('Account is already suspended');
    }
    if (user.status === AccountStatus.DEACTIVATED) {
      throw new ConflictException('A deactivated account cannot be suspended');
    }

    const result = await this.userModel.updateOne(
      { _id: user._id, status: AccountStatus.ACTIVE },
      { $set: { status: AccountStatus.SUSPENDED } },
    );
    if (result.modifiedCount === 0) {
      throw new ConflictException('Account status changed, please try again');
    }

    this.audit({
      actorId: adminId ?? '',
      action: AuditAction.ACCOUNT_SUSPENDED,
      targetType: AuditTargetType.ACCOUNT,
      targetId: user._id,
      details: { role: user.role },
    });

    await this.sessionModel.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    await this.notifyAccount(user._id, NotificationType.ACCOUNT_SUSPENDED, 'Account suspended', 'Your account has been suspended by an administrator. You cannot log in until it is reactivated.');

    return { id: user._id, email: user.email, role: user.role, status: AccountStatus.SUSPENDED };
  }

  /** ACC-16 (users), ACC-15 (moderators): only a suspended account can be reactivated. */
  async reactivateAccount(userId: string, adminId?: string) {
    const user = await this.findManagedAccount(userId, 'reactivated');

    if (user.status !== AccountStatus.SUSPENDED) {
      throw new ConflictException('Only a suspended account can be reactivated');
    }

    const result = await this.userModel.updateOne(
      { _id: user._id, status: AccountStatus.SUSPENDED },
      { $set: { status: AccountStatus.ACTIVE } },
    );
    if (result.modifiedCount === 0) {
      throw new ConflictException('Account status changed, please try again');
    }

    this.audit({
      actorId: adminId ?? '',
      action: AuditAction.ACCOUNT_REACTIVATED,
      targetType: AuditTargetType.ACCOUNT,
      targetId: user._id,
      details: { role: user.role },
    });

    await this.notifyAccount(user._id, NotificationType.ACCOUNT_REACTIVATED, 'Account reactivated', 'Your account has been reactivated. You can log in again.');

    return { id: user._id, email: user.email, role: user.role, status: AccountStatus.ACTIVE };
  }

  /** GEN-07: the change is already saved; the audit write runs in the background and never fails the action. */
  private audit(entry: AuditEntryInput) {
    try {
      void this.auditLogs.record(entry);
    } catch (err) {
      this.logger.warn(`Could not record audit entry ${entry.action}: ${String(err)}`);
    }
  }

  /** The status change is already saved, so a failed notification must not turn it into an error. */
  private async notifyAccount(userId: Types.ObjectId, type: NotificationType, title: string, message: string) {
    try {
      await this.notificationsService.create(userId, { type, title, message });
    } catch (err) {
      this.logger.warn(`Could not notify account ${String(userId)}: ${String(err)}`);
    }
  }

  private async findManagedAccount(userId: string, action: 'suspended' | 'reactivated') {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(`An admin account cannot be ${action}`);
    }
    return user;
  }

  /** GEN-01-B: emails the new moderator; a failed email never undoes the account. */
  private async sendInvitation(user: UserDocument, dto: CreateModeratorDto): Promise<void> {
    try {
      const provider =
        dto.providerType === ProviderType.HOTEL
          ? await this.hotelModel.findById(dto.providerId).select('name').lean()
          : await this.airlineModel.findById(dto.providerId).select('name').lean();
      await this.mail.sendModeratorInvitation({
        to: user.email,
        firstName: user.firstName,
        providerType: dto.providerType,
        providerName: provider?.name ?? (dto.providerType === ProviderType.HOTEL ? 'your hotel' : 'your airline'),
      });
    } catch (error) {
      this.logger.error(`Moderator invitation email could not be sent: ${(error as Error).message}`);
    }
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