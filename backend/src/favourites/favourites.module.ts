import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import {
  Itinerary,
  ItinerarySchema,
} from '../itineraries/schemas/itinerary.schema';
import { FavouritesController } from './favourites.controller';
import { FavouritesService } from './favourites.service';
import { Favourite, FavouriteSchema } from './schemas/favourite.schema';

/** BON-02: hotel and public-itinerary favourites. */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Favourite.name, schema: FavouriteSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
  ],
  controllers: [FavouritesController],
  providers: [FavouritesService],
})
export class FavouritesModule {}
