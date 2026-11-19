import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { SearchFlightsDto } from '../../flights/dto/search-flights.dto';
export enum ItineraryTripType {
  ONE_WAY = 'ONE_WAY',
  ROUND_TRIP = 'ROUND_TRIP',
}
export class ItineraryFlightSearchQueryDto extends PickType(SearchFlightsDto, [
  'departureAirport',
  'adults',
  'children',
  'infants',
  'cabinClass',
  'minPrice',
  'maxPrice',
  'sortBy',
  'sortOrder',
] as const) {
  @ApiPropertyOptional({
    enum: ItineraryTripType,
    default: ItineraryTripType.ONE_WAY,
  })
  @IsOptional()
  @IsEnum(ItineraryTripType)
  tripType?: ItineraryTripType = ItineraryTripType.ONE_WAY;

  @ApiPropertyOptional({
    example: '2040-12-05',
    description:
      'Real calendar date, local at origin airport. Defaults to itinerary start date.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departureDate?: string;

  @ApiPropertyOptional({
    example: '2040-12-10',
    description:
      'ROUND_TRIP only. Local date at each return departure airport; defaults to last itinerary day.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  returnDate?: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description:
      'Outbound page; 10 flights per page after global sorting/deduplication',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Math.floor(Number.MAX_SAFE_INTEGER / 10))
  outboundPage?: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description:
      'ROUND_TRIP only. Return page, independently paginated; defaults to 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Math.floor(Number.MAX_SAFE_INTEGER / 10))
  returnPage?: number;
}
