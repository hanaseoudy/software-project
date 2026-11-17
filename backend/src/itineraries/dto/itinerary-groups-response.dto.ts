import { ApiProperty } from '@nestjs/swagger';

export class ItineraryGroupCityDto {
  @ApiProperty({ example: 'CAI' })
  cityId: string;

  @ApiProperty({ example: 'Cairo' })
  name: string;

  @ApiProperty({ example: 'EG' })
  countryCode: string;
}

export class ItineraryGroupDayDto {
  @ApiProperty({ description: 'Existing day MongoDB ObjectId' })
  id: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 60 })
  dayNumber: number;

  @ApiProperty({ type: String, format: 'date', example: '2028-02-29' })
  date: string;
}

export class ItineraryGroupSubtotalDto {
  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 12.3, minimum: 0 })
  total: number;
}

export class ItineraryCityGroupDto {
  @ApiProperty({ type: ItineraryGroupCityDto })
  city: ItineraryGroupCityDto;

  @ApiProperty({ type: ItineraryGroupDayDto })
  firstDay: ItineraryGroupDayDto;

  @ApiProperty({ type: ItineraryGroupDayDto })
  lastDay: ItineraryGroupDayDto;

  @ApiProperty({ type: [String], description: 'Existing day IDs in ascending day order' })
  dayIds: string[];

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 60 })
  dayCount: number;

  @ApiProperty({ type: [ItineraryGroupSubtotalDto], description: 'Native-currency totals, sorted by currency; empty when no expenses exist. No conversion.' })
  budgetSubtotals: ItineraryGroupSubtotalDto[];
}

export class ItineraryGroupsResponseDto {
  @ApiProperty()
  itineraryId: string;

  @ApiProperty({ type: [ItineraryCityGroupDto], description: 'Consecutive-city groups in dayNumber order; empty for an empty itinerary' })
  groups: ItineraryCityGroupDto[];
}
