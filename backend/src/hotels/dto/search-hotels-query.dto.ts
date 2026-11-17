import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  Matches,
  ValidateBy,
} from 'class-validator';
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

// HTL-12: query values arrive as text. An empty or non-numeric value becomes NaN so it is rejected.
const toNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? NaN : Number(value)) : value;

const IsPriceFilter = (label: string) =>
  ValidateBy({
    name: 'isPriceFilter',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0,
      defaultMessage: () => `${label} must be a number of 0 or more`,
    },
  });

const IsRatingFilter = () =>
  ValidateBy({
    name: 'isRatingFilter',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 1 &&
        value <= 5,
      defaultMessage: () => 'Minimum rating must be a number from 1 to 5',
    },
  });

export enum HotelSortBy {
  PRICE = 'price',
  RATING = 'rating',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

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

  @ApiPropertyOptional({
    example: 500,
    minimum: 0,
    description:
      'HTL-12: lowest price per night (USD, inclusive). A hotel is judged by the price of its cheapest room that is free for the stay.',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsPriceFilter('Minimum price')
  minPrice?: number;

  @ApiPropertyOptional({
    example: 2000,
    minimum: 0,
    description:
      'HTL-12: highest price per night (USD, inclusive), judged the same way as minPrice. Cannot be less than minPrice.',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsPriceFilter('Maximum price')
  maxPrice?: number;

  @ApiPropertyOptional({
    example: 4,
    minimum: 1,
    maximum: 5,
    description:
      'HTL-12: minimum average rating (1 to 5). Hotels with no ratings yet are left out when this is set.',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsRatingFilter()
  minRating?: number;

  @ApiPropertyOptional({
    enum: HotelSortBy,
    description:
      'HTL-12: sort by the hotel price (cheapest free room) or by average rating. Without it results are sorted by hotel name.',
  })
  @IsOptional()
  @IsEnum(HotelSortBy, { message: 'Sort by must be price or rating' })
  sortBy?: HotelSortBy;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.ASC,
    description:
      'HTL-12: asc (default) or desc. With sortBy=rating, unrated hotels always come last.',
  })
  @IsOptional()
  @IsEnum(SortOrder, { message: 'Sort order must be asc or desc' })
  sortOrder?: SortOrder = SortOrder.ASC;
}
