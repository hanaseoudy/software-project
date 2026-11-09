
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true })
  countryIds: string[];

  @ApiProperty({
    example: '2026-12-15',
  })
  @IsDateString()
  startDate: string;
}
