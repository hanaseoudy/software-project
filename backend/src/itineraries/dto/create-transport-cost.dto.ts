import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IntercityTransportMode } from '../schemas/transport-cost.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTransportCostDto {
  @ApiProperty({ description: 'MongoDB ID of a day in this itinerary' })
  @IsMongoId()
  dayId!: string;

  @ApiProperty({
    enum: IntercityTransportMode,
    example: IntercityTransportMode.TRAIN,
  })
  @IsEnum(IntercityTransportMode)
  mode!: IntercityTransportMode;

  @ApiProperty({
    example: 'cairo',
    description: 'GEN-12 City.cityId; equal cities are permitted',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  fromCityId!: string;

  @ApiProperty({
    example: 'new_york',
    description: 'GEN-12 City.cityId; no adjacency/day-city restriction',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  toCityId!: string;

  @ApiProperty({
    example: 12.5,
    minimum: 0,
    description: 'Finite nonnegative number with at most two decimal places',
  })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  amount!: number;

  @ApiProperty({
    example: 'USD',
    description: 'GEN-12 supported currency; required even for zero amount',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
