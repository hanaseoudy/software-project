import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ModeratorAssignment, ModeratorAssignmentSchema } from '../users/schemas/moderatorassignment.schema';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { Session, SessionSchema } from '../auth/schemas/session.schema';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';

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
    NotificationsModule,
  ],
  controllers: [AdminController, AdminProvidersController],
  providers: [AdminService, AdminProvidersService],
})
export class AdminModule {}