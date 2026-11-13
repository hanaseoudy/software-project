import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** HTL-03: one individually bookable room. */
export class CreateRoomDto {
  @ApiProperty({
    example: 'A101',
    maxLength: 50,
    description:
      'Room number or name, unique within the hotel (saved in capital letters, so "a101" and "A101" are the same room)',
  })
  @Transform(trim)
  @IsString({ message: 'Room number is required' })
  @IsNotEmpty({ message: 'Room number is required' })
  @MaxLength(50, { message: 'Room number must be at most 50 characters' })
  roomNumber!: string;

  @ApiProperty({ example: 'Double', maxLength: 50 })
  @Transform(trim)
  @IsString({ message: 'Room type is required' })
  @IsNotEmpty({ message: 'Room type is required' })
  @MaxLength(50, { message: 'Room type must be at most 50 characters' })
  type!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt({ message: 'Beds must be a whole number of at least 1' })
  @Min(1, { message: 'Beds must be at least 1' })
  @Max(50, { message: 'Beds must be at most 50' })
  beds!: number;

  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt({ message: 'Maximum occupancy must be a whole number of at least 1' })
  @Min(1, { message: 'Maximum occupancy must be at least 1' })
  @Max(100, { message: 'Maximum occupancy must be at most 100' })
  maxOccupancy!: number;

  @ApiProperty({
    example: 1500.5,
    description: 'Price per night, more than 0, at most 2 decimal places',
  })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Price per night must be a number with at most 2 decimals' },
  )
  @Min(0.01, { message: 'Price per night must be more than 0' })
  pricePerNight!: number;
}
