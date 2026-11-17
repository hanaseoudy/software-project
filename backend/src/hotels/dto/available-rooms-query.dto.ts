import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * HTL-15: GET /api/hotels/:id/rooms/available. The stay dates the guest searched for.
 * Page size is fixed at 10 (GEN-05).
 */
export class AvailableRoomsQueryDto extends PaginationQueryDto {
  @ApiProperty({
    example: '2026-12-10',
    description: 'First night of the stay, YYYY-MM-DD. Cannot be in the past.',
  })
  @Matches(dayPattern, {
    message: 'Check-in must be a real date in YYYY-MM-DD format',
  })
  checkIn!: string;

  @ApiProperty({
    example: '2026-12-14',
    description: 'Day the guests leave, YYYY-MM-DD. Must be after check-in.',
  })
  @Matches(dayPattern, {
    message: 'Check-out must be a real date in YYYY-MM-DD format',
  })
  checkOut!: string;
}
