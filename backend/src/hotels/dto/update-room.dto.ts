import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * HTL-05: fields a moderator can change on a room. Send at least one.
 * The price is copied into a booking when it is made, so a new price never changes old bookings.
 */
export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @IsInt({ message: 'Beds must be a whole number of at least 1' })
  @Min(1, { message: 'Beds must be at least 1' })
  @Max(50, { message: 'Beds must be at most 50' })
  beds?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1 })
  @IsOptional()
  @IsInt({ message: 'Maximum occupancy must be a whole number of at least 1' })
  @Min(1, { message: 'Maximum occupancy must be at least 1' })
  @Max(100, { message: 'Maximum occupancy must be at most 100' })
  maxOccupancy?: number;

  @ApiPropertyOptional({
    example: 1750,
    description: 'New price per night, more than 0, at most 2 decimal places',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Price per night must be a number with at most 2 decimals' },
  )
  @Min(0.01, { message: 'Price per night must be more than 0' })
  pricePerNight?: number;
}
