import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateActivityDto {
  @ApiProperty({ example: 'Museum visit' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Visit the local history museum' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({
    example: '14:30',
    minLength: 5,
    maxLength: 5,
    nullable: true,
    description: '24-hour HH:mm; null leaves time unset',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Length(5, 5)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time?: string | null;

  @ApiPropertyOptional({
    example: 12.5,
    minimum: 0,
    nullable: true,
    description:
      'Finite nonnegative number with at most two decimal places; null leaves cost/currency unset',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  cost?: number | null;

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'GEN-12 supported currency, required with any cost including zero',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
