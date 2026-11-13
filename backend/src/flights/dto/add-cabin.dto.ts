import { IsEnum, IsInt, IsNumber, Min, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CabinClass } from '../schemas/airline.schema'; // adjust path to where your enum lives

export class AddCabinDto {
  @ApiProperty({ enum: CabinClass })
  @IsEnum(CabinClass)
  cabinClass: CabinClass;

  @ApiProperty({ example: 120, description: 'Whole number, > 0' })
  @IsInt()
  @Min(1)
  totalSeats: number;

  @ApiProperty({ example: 199.99, description: 'Price in USD, > 0' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({
    example: 2,
    description: 'Free baggage allowance (bag count)',
  })
  @IsInt()
  @Min(0)
  freeBags: number;

  @ApiProperty({ example: 23, description: 'Maximum weight per bag in kg' })
  @IsNumber()
  @IsPositive()
  maxBagWeightKg: number;
}
