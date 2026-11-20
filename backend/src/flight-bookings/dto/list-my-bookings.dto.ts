import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

// dto/list-my-bookings.dto.ts
export enum BookingGroup {
  UPCOMING = 'upcoming',
  PAST = 'past',
  CANCELLED = 'cancelled',
}

export class ListMyBookingsDto {
  @ApiPropertyOptional({
    enum: BookingGroup,
    default: BookingGroup.UPCOMING,
    description: 'Which tray to list: upcoming, past or cancelled',
  })
  @IsOptional()
  @IsEnum(BookingGroup)
  group: BookingGroup = BookingGroup.UPCOMING;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number, 10 bookings per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}
