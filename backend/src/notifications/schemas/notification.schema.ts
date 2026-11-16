import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { NotificationType } from '../enums/notification.enums';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true })
export class Notification {
  // the recipient (same field name as in FlightBooking / HotelBooking)
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType, required: true })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  message: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  // optional extra info, e.g. { bookingId, bookingType, flightId, refundId }
  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// fast "my notifications, newest first" and "my unread count"
NotificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
