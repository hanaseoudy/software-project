import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/pagination/pagination';
import { ItineraryVisibility } from '../schemas/itinerary.schema';
import { BudgetCategory } from '../schemas/budget-entry.schema';
import { IntercityTransportMode } from '../schemas/transport-cost.schema';

// ITN-21: read-only activity in a public itinerary
export class PublicActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional({ example: '14:30' })
  time?: string;

  @ApiPropertyOptional({ minimum: 0 })
  cost?: number;

  @ApiPropertyOptional({ example: 'EGP' })
  currency?: string;

  @ApiProperty({ type: [String] })
  images: string[];
}

// ITN-21: read-only budget entry (ITN-14) in a public itinerary
export class PublicBudgetEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: BudgetCategory })
  category: BudgetCategory;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;
}

// ITN-21: read-only intercity transport cost (ITN-16) in a public itinerary
export class PublicTransportCostDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: IntercityTransportMode })
  mode: IntercityTransportMode;

  @ApiProperty({ example: 'cairo' })
  fromCityId: string;

  @ApiProperty({ example: 'alexandria' })
  toCityId: string;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;
}

export class PublicItineraryAuthorDto {
  @ApiProperty({ type: String, nullable: true, example: 'Sara Ali', description: 'Null if the author account no longer exists' })
  name: string | null;
}

export class PublicItineraryDayDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 60 })
  dayNumber: number;

  @ApiProperty({ example: 'CAI' })
  cityId: string;

  @ApiProperty({ type: String, format: 'date', example: '2028-02-29' })
  date: string;

  @ApiProperty({ type: [PublicActivityDto] })
  activities: PublicActivityDto[];

  @ApiProperty({ type: [PublicBudgetEntryDto] })
  budgetEntries: PublicBudgetEntryDto[];

  @ApiProperty({ type: [PublicTransportCostDto] })
  transportCosts: PublicTransportCostDto[];
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
  @ApiProperty({ type: PublicItineraryAuthorDto })
  author: PublicItineraryAuthorDto;

  @ApiProperty({ type: [PublicItineraryDayDto] })
  days: PublicItineraryDayDto[];
}

export class PublicItineraryPageDto extends PaginatedResponseDto {
  @ApiProperty({ type: [PublicItinerarySummaryDto] })
  declare items: PublicItinerarySummaryDto[];
}
