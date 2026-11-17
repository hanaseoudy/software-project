import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengers: number;
}
