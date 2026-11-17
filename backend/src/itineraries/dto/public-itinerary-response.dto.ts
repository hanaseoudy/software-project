import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/pagination/pagination';
import { ItineraryVisibility } from '../schemas/itinerary.schema';

export class PublicItineraryDayDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 60 })
  dayNumber: number;

  @ApiProperty({ example: 'CAI' })
  cityId: string;

  @ApiProperty({ type: String, format: 'date', example: '2028-02-29' })
  date: string;
}

export class PublicItinerarySummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [String], example: ['EG'] })
  countryIds: string[];

  @ApiProperty({ type: String, format: 'date' })
  startDate: string;

  @ApiProperty({ enum: [ItineraryVisibility.PUBLIC] })
  visibility: ItineraryVisibility.PUBLIC;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 60 })
  dayCount: number;
}

export class PublicItineraryDetailDto extends PublicItinerarySummaryDto {
  @ApiProperty({ type: [PublicItineraryDayDto] })
  days: PublicItineraryDayDto[];
}

export class PublicItineraryPageDto extends PaginatedResponseDto {
  @ApiProperty({ type: [PublicItinerarySummaryDto] })
  declare items: PublicItinerarySummaryDto[];
}
