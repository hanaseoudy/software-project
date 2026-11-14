import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ModeratorAssignment, ModeratorAssignmentSchema } from '../users/schemas/moderatorassignment.schema';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Airline.name, schema: AirlineSchema },
    ]),
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}