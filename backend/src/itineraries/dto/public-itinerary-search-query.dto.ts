import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ITN-21: public itinerary search and filters
export class PublicItinerarySearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'egypt',
    description: 'Case-insensitive partial match on the title, country name or code, or city name or code',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Keyword must be text' })
  @IsNotEmpty({ message: 'Keyword cannot be empty' })
  @MaxLength(100, { message: 'Keyword must be at most 100 characters' })
  keyword?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 60, description: 'Minimum number of days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Minimum days must be a whole number' })
  @Min(1, { message: 'Minimum days must be at least 1' })
  @Max(60, { message: 'Minimum days must be at most 60' })
  minDays?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 60, description: 'Maximum number of days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Maximum days must be a whole number' })
  @Min(1, { message: 'Maximum days must be at least 1' })
  @Max(60, { message: 'Maximum days must be at most 60' })
  maxDays?: number;

  @ApiPropertyOptional({ example: 'EG', description: 'Country code (exact, case-insensitive)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'Country must be text' })
  @Matches(/^[A-Z]{2}$/, { message: 'Country must be a 2-letter country code' })
  country?: string;

  @ApiPropertyOptional({ example: 'cairo', description: 'City code (exact, case-insensitive)' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'City must be text' })
  @IsNotEmpty({ message: 'City cannot be empty' })
  @MaxLength(100, { message: 'City must be at most 100 characters' })
  city?: string;
}
