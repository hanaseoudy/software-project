import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ModeratorAssignment, ModeratorAssignmentSchema } from '../users/schemas/moderatorassignment.schema';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { Session, SessionSchema } from '../auth/schemas/session.schema';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Airline.name, schema: AirlineSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
    AuthModule,
    MailModule, // GEN-01-B: moderator invitation email
    NotificationsModule,
    AuditLogsModule, // GEN-07: audit entries for admin actions
  ],
controllers: [AdminController, AdminAccountsController, AdminProvidersController],
  providers: [AdminService, AdminAccountsService, AdminProvidersService],
})
export class AdminModule {}