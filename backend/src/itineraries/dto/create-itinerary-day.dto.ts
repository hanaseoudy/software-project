import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItineraryDayDto {
  @ApiProperty({ description: 'City ID from the seeded cities list', example: 'BER' })
  @IsString()
  @IsNotEmpty()
  cityId: string;

  @ApiPropertyOptional({ description: 'Optional notes, up to 1000 characters', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
