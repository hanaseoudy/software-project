
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsValidCalendarDate } from './is-valid-calendar-date.validator';

export class UpdateItineraryDto {
  @ApiPropertyOptional({
    example: 'Updated Europe Trip',
    maxLength: 100,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString({
    message: 'title must be a string',
  })
  @MinLength(1, {
    message: 'title cannot be empty',
  })
  @MaxLength(100, {
    message: 'title must not exceed 100 characters',
  })
  @Matches(/\S/, {
    message: 'title cannot be blank',
  })
  title?: string;

  @ApiPropertyOptional({
    example: ['DE', 'FR', 'GB'],
    type: [String],
    minItems: 1,
    uniqueItems: true,
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((v: unknown) => typeof v === 'string' ? v.toUpperCase() : v) : value,
  )
  @IsArray({
    message: 'countryIds must be an array',
  })
  @ArrayMinSize(1, {
    message: 'At least one country is required',
  })
  @ArrayUnique({
    message: 'Duplicate country codes are not allowed',
  })
  @IsString({
    each: true,
    message: 'Every country code must be a string',
  })
  @Matches(/^[A-Z]{2}$/, {
    each: true,
    message:
      'Country codes must contain exactly two uppercase letters',
  })
  countryIds?: string[];

  @ApiPropertyOptional({
    example: '2027-01-15',
    description: 'Valid calendar date in YYYY-MM-DD format',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsValidCalendarDate()
  startDate?: string;
}
