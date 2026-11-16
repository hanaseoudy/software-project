import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsPositive, Min } from 'class-validator';

export class SetBaggagePolicyDto {
  @ApiProperty({
    example: 50,
    description: 'Price per extra bag in USD (must be greater than 0)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Extra bag price must be greater than 0' })
  extraBagPrice: number;

  @ApiProperty({
    example: 3,
    description: 'Maximum number of extra bags allowed per passenger (>= 0)',
  })
  @IsInt({ message: 'Maximum extra bags must be a whole number' })
  @Min(0, { message: 'Maximum extra bags cannot be negative' })
  maxExtraBagsPerPassenger: number;
}
