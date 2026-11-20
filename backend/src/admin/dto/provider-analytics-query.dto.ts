import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { AdminBookingType } from './list-bookings-query.dto';

export class ProviderAnalyticsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: AdminBookingType,
    description: 'Only airlines (flight) or only hotels (hotel). Default: both',
  })
  @IsOptional()
  @IsEnum(AdminBookingType, {
    message: `Type must be one of: ${Object.values(AdminBookingType).join(', ')}`,
  })
  type?: AdminBookingType;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Start of the period (YYYY-MM-DD, UTC). Default: no start',
  })
  @IsOptional()
  @IsDateString({}, { message: 'From must be a valid date (YYYY-MM-DD)' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description:
      'End of the period (YYYY-MM-DD, UTC, the whole day is included). Default: no end',
  })
  @IsOptional()
  @IsDateString({}, { message: 'To must be a valid date (YYYY-MM-DD)' })
  to?: string;
}
