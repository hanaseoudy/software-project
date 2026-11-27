import { ApiProperty } from '@nestjs/swagger';

export class CityResponseDto {
  @ApiProperty({
    description: 'Database id of the city (used by hotels, e.g. HTL-01 / HTL-11)',
    example: '6aeeecf022a36c4e4cf30156',
  })
  id!: string;

  @ApiProperty({
    description: 'Reference-data city id (used by itineraries, e.g. ITN-05 / ITN-16)',
    example: 'cairo',
  })
  cityId!: string;

  @ApiProperty({ example: 'Cairo' })
  name!: string;

  @ApiProperty({ description: 'ISO code of the country the city belongs to', example: 'EG' })
  countryCode!: string;
}
