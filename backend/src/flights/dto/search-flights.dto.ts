import {
  IsInt,
  IsNotEmpty,
  Length,
  Matches,
  IsEnum,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CabinClass } from '../../airlines/schemas/airline.schema';

export class SearchFlightsDto {
  @ApiProperty({ example: 'CAI' })
  @IsNotEmpty()
  @Length(3, 3, { message: 'Departure airport must be a 3-letter IATA code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  departureAirport: string;

  @ApiProperty({ example: 'DXB' })
  @IsNotEmpty()
  @Length(3, 3, { message: 'Departure airport must be a 3-letter IATA code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  arrivalAirport: string;

  @ApiProperty({
    example: '2026-12-05',
    description: 'Local date at the departure airport',
  })
  // "2026-12-01" -> the LOCAL date at the departure airport
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'departureDate must be YYYY-MM-DD',
  })
  departureDate: string;

  @ApiProperty({
    example: '2026-12-05',
    description: 'Local date at the departure airport',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  returnDate?: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  children?: number = 0;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infants?: number = 0;

  @ApiProperty({ enum: CabinClass })
  @IsOptional()
  @IsEnum(CabinClass)
  cabinClass?: CabinClass;
}
