import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { SearchHotelsQueryDto } from '../../hotels/dto/search-hotels-query.dto';

// Reuse HTL-11/12 occupancy, pagination and filter validation. Destination and
// stay dates are deliberately excluded: they come from the owned itinerary.
export class ItineraryHotelSearchQueryDto extends PickType(
  SearchHotelsQueryDto,
  [
    'guests',
    'rooms',
    'page',
    'minPrice',
    'maxPrice',
    'minRating',
    'sortBy',
    'sortOrder',
  ] as const,
) {
  @ApiProperty({
    description:
      'Current city group firstDay.id from GET /api/itineraries/:id/groups',
  })
  @IsMongoId()
  groupFirstDayId!: string;
}
