import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomDayStatus } from '../utils/room-status';

/** HTL-08: one stretch of days with the same status. */
export class RoomStatusPeriodDto {
  @ApiProperty({ enum: RoomDayStatus, example: RoomDayStatus.BOOKED })
  status!: RoomDayStatus;

  @ApiProperty({ example: '2026-12-10', description: 'First day, YYYY-MM-DD' })
  startDate!: string;

  @ApiProperty({
    example: '2026-12-13',
    description:
      'Last day, YYYY-MM-DD. For BOOKED this is the last night of the stay (the day before check-out).',
  })
  endDate!: string;

  @ApiPropertyOptional({
    example: 'HB-1042',
    description:
      'BOOKED only: the reservation reference (the booking reference, or the reservation id while it has none yet)',
  })
  reservationReference?: string;

  @ApiPropertyOptional({
    example: 'CONFIRMED',
    description:
      'BOOKED only: CONFIRMED, or PENDING_PAYMENT for a hold that has not expired',
  })
  reservationStatus?: string;
}

/** HTL-08: the status of one room for the chosen days. */
export class RoomStatusDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc01' })
  roomId!: string;

  @ApiProperty({ example: 'A101' })
  roomNumber!: string;

  @ApiProperty({ example: 'Double' })
  type!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    type: [RoomStatusPeriodDto],
    description:
      'Periods in date order. Days that are not in a bookable range, a block or a reservation have no period.',
  })
  periods!: RoomStatusPeriodDto[];
}

/** GEN-05: one page (10 rooms) of room statuses. */
export class RoomStatusPageDto {
  @ApiProperty({ type: [RoomStatusDto], description: 'Up to 10 rooms' })
  items!: RoomStatusDto[];

  @ApiProperty({ example: 12, description: 'Total number of rooms' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
