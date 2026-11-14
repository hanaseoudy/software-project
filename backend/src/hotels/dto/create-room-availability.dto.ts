import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/** HTL-04: one date range when a room can be booked (both days included). */
export class CreateRoomAvailabilityDto {
  @ApiProperty({
    example: '2026-12-01',
    description: 'First bookable day, YYYY-MM-DD',
  })
  @Matches(dayPattern, {
    message: 'Start date must be a real date in YYYY-MM-DD format',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-12-31',
    description:
      'Last bookable day, YYYY-MM-DD. Must not be before the start date.',
  })
  @Matches(dayPattern, {
    message: 'End date must be a real date in YYYY-MM-DD format',
  })
  endDate!: string;
}
