import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationType } from './enums/notification.enums';
import { Notification, NotificationDocument } from './schemas/notification.schema';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface ListNotificationsOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly mail: MailService,
  ) {}

  private toObjectId(id: string | Types.ObjectId): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id');
    return new Types.ObjectId(id);
  }

  /**
   * Used by OTHER modules (payments, flights, admin...) to notify one user.
   * Example: await this.notificationsService.create(booking.user, {
   *   type: NotificationType.BOOKING_CONFIRMED, title: 'Booking confirmed',
   *   message: `Your booking ${ref} is confirmed.`, metadata: { bookingId } });
   */
  async create(userId: string | Types.ObjectId, input: CreateNotificationInput) {
    const notification = await this.notificationModel.create({ user: this.toObjectId(userId), ...input });
    void this.emailUsers([notification.user], input);
    return notification;
  }

  /** Same notification for many users (e.g. a flight schedule change). */
  async createForMany(userIds: Array<string | Types.ObjectId>, input: CreateNotificationInput) {
    if (userIds.length === 0) return [];
    const unique = [...new Set(userIds.map((u) => String(u)))];
    const created = await this.notificationModel.insertMany(
      unique.map((u) => ({ user: this.toObjectId(u), ...input })),
    );
    void this.emailUsers(
      unique.map((u) => this.toObjectId(u)),
      input,
    );
    return created;
  }

  /**
   * GEN-01-B: sends the same notification by email (SMTP). Runs in the background after the
   * in-app notification is saved, so a slow or failing email never blocks or undoes it.
   */
  private async emailUsers(userIds: Types.ObjectId[], input: CreateNotificationInput): Promise<void> {
    try {
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('email firstName')
        .lean();
      await Promise.all(
        users.map((user) => this.mail.sendNotification(user.email, user.firstName, input.title, input.message)),
      );
    } catch (error) {
      this.logger.error(`Notification email could not be sent: ${(error as Error).message}`);
    }
  }

  // GET /api/notifications
  async findAll(userId: string, options: ListNotificationsOptions = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 10));
    const filter: Record<string, any> = { user: this.toObjectId(userId) };
    if (options.unreadOnly) filter.isRead = false;

    const [data, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({ user: this.toObjectId(userId), isRead: false }),
    ]);

    return { data, total, unreadCount, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // GET /api/notifications/unread-count
  async getUnreadCount(userId: string) {
    const unreadCount = await this.notificationModel.countDocuments({
      user: this.toObjectId(userId),
      isRead: false,
    });
    return { unreadCount };
  }

  // PATCH /api/notifications/:id/read
  async markAsRead(userId: string, id: string) {
    const notification = await this.notificationModel.findOne({
      _id: this.toObjectId(id),
      user: this.toObjectId(userId), // ownership: you can only touch your own
    });
    // 404 for both "doesn't exist" and "belongs to someone else" (don't leak existence)
    if (!notification) throw new NotFoundException('Notification not found');

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }
    return notification;
  }

  // PATCH /api/notifications/read-all
  async markAllAsRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      { user: this.toObjectId(userId), isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return { updated: result.modifiedCount };
  }
}
