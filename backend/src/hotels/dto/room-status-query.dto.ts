import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * HTL-08: GET /api/hotels/:id/availability. The date range the moderator wants to look at
 * (both days included). Page size is fixed at 10 rooms (GEN-05).
 */
export class RoomStatusQueryDto extends PaginationQueryDto {
  @ApiProperty({
    example: '2026-12-01',
    description: 'First day to look at, YYYY-MM-DD',
  })
  @Matches(dayPattern, {
    message: 'Start date must be a real date in YYYY-MM-DD format',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-12-31',
    description:
      'Last day to look at, YYYY-MM-DD. Must not be before the start date.',
  })
  @Matches(dayPattern, {
    message: 'End date must be a real date in YYYY-MM-DD format',
  })
  endDate!: string;
}
