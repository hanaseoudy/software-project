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
import { HotelRoomAvailabilityController } from './hotel-room-availability.controller';
import { HotelRoomAvailabilityService } from './hotel-room-availability.service';
import { HotelSearchController } from './hotel-search.controller';
import { HotelSearchService } from './hotel-search.service';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomAvailability.name, schema: RoomAvailabilitySchema },
      { name: HotelBooking.name, schema: HotelBookingSchema }, // HTL-06: reservation checks
      { name: City.name, schema: CitySchema },
      { name: Country.name, schema: CountrySchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
    ]),
    AuthModule, // JwtAuthGuard
    UploadsModule, // UploadsService.isStoredUrl for hotel photos (GEN-08)
  ],
  // HotelSearchController first: "/hotels/search" must not be matched by "/hotels/:id" (HTL-02)
  controllers: [
    HotelSearchController,
    HotelRoomAvailabilityController,
    HotelsController,
  ],
  providers: [
    HotelsService,
    HotelSearchService,
    HotelRoomAvailabilityService,
  ],
  exports: [MongooseModule, HotelsService],
})
export class HotelsModule {}
