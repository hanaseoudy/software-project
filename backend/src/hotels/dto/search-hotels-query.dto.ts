import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsMongoId, IsOptional, Matches, ValidateBy } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

// GEN-02: one clear message per field. A whole number of at least 1 (guests, rooms).
const IsCount = (label: string) =>
  ValidateBy({
    name: 'isCount',
    validator: {
      validate: (value: unknown) =>
        Number.isSafeInteger(value) && (value as number) >= 1,
      defaultMessage: () => `${label} must be a whole number of at least 1`,
    },
  });

/**
 * HTL-11: GET /api/hotels/search. Choose a city or a country (at least one, checked in the
 * service), the stay dates, the number of guests and rooms. Page size is fixed at 10 (GEN-05).
 */
export class SearchHotelsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '675f1b2c9d3e4a00aabbccdd',
    description:
      'City id from the reference data. Send a city, a country or both.',
  })
  @IsOptional()
  @IsMongoId({ message: 'City must be a valid id' })
  city?: string;

  @ApiPropertyOptional({
    example: '675f1b2c9d3e4a00aabbccee',
    description:
      'Country id from the reference data. Send a city, a country or both.',
  })
  @IsOptional()
  @IsMongoId({ message: 'Country must be a valid id' })
  country?: string;

  @ApiProperty({
    example: '2026-12-10',
    description: 'First night of the stay, YYYY-MM-DD. Cannot be in the past.',
  })
  @Matches(dayPattern, {
    message: 'Check-in must be a real date in YYYY-MM-DD format',
  })
  checkIn!: string;

  @ApiProperty({
    example: '2026-12-14',
    description: 'Day the guests leave, YYYY-MM-DD. Must be after check-in.',
  })
  @Matches(dayPattern, {
    message: 'Check-out must be a real date in YYYY-MM-DD format',
  })
  checkOut!: string;

  @ApiProperty({ example: 3, minimum: 1, description: 'Number of guests' })
  @Type(() => Number)
  @IsCount('Guests')
  guests!: number;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    default: 1,
    description: 'Number of rooms needed (default 1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsCount('Rooms')
  rooms?: number = 1;
}
