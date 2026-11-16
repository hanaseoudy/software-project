import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsUppercase,
  Matches,
} from 'class-validator';

import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAirlineDto {
  @ApiProperty({ example: 'EgyptAir' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'MS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  @MinLength(2)
  @IsUppercase()
  @Matches(/^[A-Z0-9]{2,3}$/, {
    message: 'code must be 2-3 uppercase letters or digits',
  })
  code: string;

  @ApiPropertyOptional({ example: 'National carrier of Egypt' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  description?: string;
}
