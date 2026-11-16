import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateItineraryDayDto {
  @ApiPropertyOptional({ description: 'City ID from the seeded cities list' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cityId?: string;

  @ApiPropertyOptional({ description: 'Optional notes, up to 1000 characters', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
