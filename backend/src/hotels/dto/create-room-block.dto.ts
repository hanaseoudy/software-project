import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/** HTL-06: one date range during which a room cannot be booked (both days included). */
export class CreateRoomBlockDto {
  @ApiProperty({
    example: '2026-12-10',
    description: 'First blocked day, YYYY-MM-DD',
  })
  @Matches(dayPattern, {
    message: 'Start date must be a real date in YYYY-MM-DD format',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-12-15',
    description:
      'Last blocked day, YYYY-MM-DD. Must not be before the start date.',
  })
  @Matches(dayPattern, {
    message: 'End date must be a real date in YYYY-MM-DD format',
  })
  endDate!: string;

  @ApiPropertyOptional({
    example: 'Maintenance',
    description: 'Why the room is blocked (up to 200 characters)',
  })
  @IsOptional()
  @IsString({ message: 'Reason must be text' })
  @MaxLength(200, { message: 'Reason must be at most 200 characters' })
  reason?: string;
}
