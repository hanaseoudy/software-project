import { ApiProperty } from '@nestjs/swagger';

export class AirportResponseDto {
  @ApiProperty({
    description: 'MongoDB airport ID used when selecting an airport.',
    example: '507f1f77bcf86cd799439011',
  })
  id: string;

  @ApiProperty({ example: 'CAI' })
  iataCode: string;

  @ApiProperty({ example: 'Cairo International Airport' })
  name: string;

  @ApiProperty({
    description: 'Reference-data city identifier.',
    example: 'cairo',
  })
  city: string;

  @ApiProperty({ description: 'Reference-data country code.', example: 'EG' })
  country: string;

  @ApiProperty({ description: 'IANA time zone.', example: 'Africa/Cairo' })
  timezone: string;
}
