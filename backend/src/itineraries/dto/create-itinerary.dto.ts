
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsValidCalendarDate } from './is-valid-calendar-date.validator';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateItineraryDto {
  @ApiProperty({
    example: 'Summer Trip to Europe',
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'Title cannot be blank' })
  title: string;

  @ApiProperty({
    example: ['DE', 'FR'],
    type: [String],
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((v: unknown) => typeof v === 'string' ? v.toUpperCase() : v) : value,
  )
  @IsArray()
  @ArrayUnique({ message: 'Duplicate country codes are not allowed' })
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true })
  countryIds: string[];

  @ApiProperty({
    example: '2026-12-15',
  })
  @IsValidCalendarDate()
  startDate: string;
}
