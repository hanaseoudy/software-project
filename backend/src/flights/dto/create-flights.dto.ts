import { ApiProperty } from '@nestjs/swagger';
import { Airport } from '../../airports/schemas/airport.schema';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateFlightsDto {
  @ApiProperty({ example: 'MS777' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{2,6}$/, {
    message: 'flight number must be 2 to 6 uppercase letters or digits',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  flightNumber: string;

  @ApiProperty({ example: 'CAI' })
  @IsNotEmpty()
  @Length(3, 3, { message: 'Departure airport must be a 3-letter IATA code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  departureAirport: Airport;

  @ApiProperty({ example: 'DXB' })
  @IsNotEmpty()
  @Length(3, 3, { message: 'Arrival airport must be a 3-letter IATA code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  arrivalAirport: Airport;

  @ApiProperty({ example: '2026-12-05T10:00' })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: 'must be local time like 2026-12-05T10:00 (no timezone or Z)',
  })
  departureTime: string;

  @ApiProperty({ example: '2026-12-05T10:00' })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: 'must be local time like 2026-12-05T10:00 (no timezone or Z)',
  })
  arrivalTime: string;
}
