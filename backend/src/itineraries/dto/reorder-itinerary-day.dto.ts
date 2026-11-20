import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class ReorderItineraryDayDto {
  @ApiProperty({ description: 'One-based position, no greater than the current day count', type: 'integer', example: 2, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  newPosition: number;
}
