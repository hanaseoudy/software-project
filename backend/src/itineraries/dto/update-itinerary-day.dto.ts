
import {
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateItineraryDayDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cityId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
