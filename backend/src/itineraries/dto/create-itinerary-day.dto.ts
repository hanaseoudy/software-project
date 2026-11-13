
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateItineraryDayDto {
  @IsString()
  @IsNotEmpty()
  cityId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
