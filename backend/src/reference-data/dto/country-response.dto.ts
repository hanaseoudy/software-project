import { ApiProperty } from '@nestjs/swagger';

export class CountryResponseDto {
  @ApiProperty({
    description: 'Database id of the country (used by hotels, e.g. HTL-01 / HTL-11)',
    example: '6aeeecf022a36c4e4cf3014e',
  })
  id!: string;

  @ApiProperty({ description: 'ISO country code (used by itineraries, e.g. ITN-01)', example: 'EG' })
  code!: string;

  @ApiProperty({ example: 'Egypt' })
  name!: string;

  @ApiProperty({ description: 'Currency code of the country', example: 'EGP' })
  currency!: string;
}
