import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class ItineraryFlightPageDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Existing FLT-11 formatted flight objects, including populated airline/airports, UTC and local times, and cabins with cabinId, cabinClass, seatsRemaining, fare and totalPrice',
  })
  items!: Record<string, unknown>[];
  @ApiProperty({
    description:
      'Unique matching flights across all eligible airports before pagination',
  })
  total!: number;
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ example: 10 }) pageSize!: number;
  @ApiProperty() totalPages!: number;
}
export class ItineraryFlightSearchResponseDto {
  @ApiProperty({ type: ItineraryFlightPageDto })
  outbound!: ItineraryFlightPageDto;
  @ApiPropertyOptional({
    type: ItineraryFlightPageDto,
    description:
      'Present only for ROUND_TRIP. Eligible city airports back to the chosen origin.',
  })
  return?: ItineraryFlightPageDto;
}
