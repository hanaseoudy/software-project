import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hotel, HotelSchema } from './schemas/hotel.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import {
  RoomAvailability,
  RoomAvailabilitySchema,
} from './schemas/room-availability.schema';
import { City, CitySchema } from '../reference-data/schemas/city.schema';
import {
  Country,
  CountrySchema,
} from '../reference-data/schemas/country.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentSchema,
} from '../users/schemas/moderatorassignment.schema';
import {
  HotelBooking,
  HotelBookingSchema,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomAvailability.name, schema: RoomAvailabilitySchema },
      { name: City.name, schema: CitySchema },
      { name: Country.name, schema: CountrySchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
    AuthModule, // JwtAuthGuard
    UploadsModule, // UploadsService.isStoredUrl for hotel photos (GEN-08)
  ],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [MongooseModule, HotelsService],
})
export class HotelsModule {}
