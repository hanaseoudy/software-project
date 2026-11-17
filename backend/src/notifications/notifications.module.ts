import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationSchema } from './schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema }, // GEN-01-B: recipient's email address
    ]),
    MailModule, // GEN-01-B: notifications are also sent by email
  ],
  providers: [NotificationsService],
  exports: [NotificationsService], // other modules import this to send notifications
})
export class NotificationsModule {}
