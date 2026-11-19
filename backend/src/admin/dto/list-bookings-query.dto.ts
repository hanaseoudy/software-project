import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { BookingStatus } from '../../common/booking-status/booking-state-transitions';
import { PaginationQueryDto } from '../../common/pagination/pagination';

export enum AdminBookingType {
  FLIGHT = 'flight',
  HOTEL = 'hotel',
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: AdminBookingType,
    description:
      'Only flight bookings or only hotel reservations (default: both)',
  })
  @IsOptional()
  @IsEnum(AdminBookingType, {
    message: `Type must be one of: ${Object.values(AdminBookingType).join(', ')}`,
  })
  type?: AdminBookingType;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus, {
    message: `Status must be one of: ${Object.values(BookingStatus).join(', ')}`,
  })
  status?: BookingStatus;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Bookings created on or after this date (YYYY-MM-DD, UTC)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'From must be a valid date (YYYY-MM-DD)' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description:
      'Bookings created on or before this date (YYYY-MM-DD, UTC, the whole day is included)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'To must be a valid date (YYYY-MM-DD)' })
  to?: string;
}
