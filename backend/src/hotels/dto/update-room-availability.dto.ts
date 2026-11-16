import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, Matches, ValidateIf } from 'class-validator';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const sent = (_object: unknown, value: unknown) => value !== undefined;

/** HTL-05: change the dates of one bookable range of a room (both days included). */
export class UpdateRoomAvailabilityDto {
  @ApiProperty({
    example: '675f1b2c9d3e4a00aabbccdd',
    description:
      'The id of the bookable range to change (from the HTL-04 response)',
  })
  @IsMongoId({ message: 'Range id must be a valid id' })
  rangeId!: string;

  @ApiPropertyOptional({
    example: '2026-12-05',
    description: 'New first bookable day, YYYY-MM-DD. Leave out to keep it.',
  })
  @ValidateIf(sent)
  @Matches(dayPattern, {
    message: 'Start date must be a real date in YYYY-MM-DD format',
  })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-25',
    description: 'New last bookable day, YYYY-MM-DD. Leave out to keep it.',
  })
  @ValidateIf(sent)
  @Matches(dayPattern, {
    message: 'End date must be a real date in YYYY-MM-DD format',
  })
  endDate?: string;
}
