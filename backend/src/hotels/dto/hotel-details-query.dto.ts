import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** HTL-02: optional stay dates; when both are given the available rooms are listed. */
export class HotelDetailsQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-10',
    description: 'Check-in day, YYYY-MM-DD. Send together with checkOut.',
  })
  @IsOptional()
  @IsString({ message: 'Check-in must be a date in YYYY-MM-DD format' })
  checkIn?: string;

  @ApiPropertyOptional({
    example: '2026-12-13',
    description:
      'Check-out day, YYYY-MM-DD, after the check-in day. Send together with checkIn.',
  })
  @IsOptional()
  @IsString({ message: 'Check-out must be a date in YYYY-MM-DD format' })
  checkOut?: string;
}
