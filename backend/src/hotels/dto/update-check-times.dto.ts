import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { timeRegex } from '../schemas/validators';

/** HTL-09: the hotel's standard check-in and check-out times. */
export class UpdateCheckTimesDto {
  @ApiProperty({
    example: '14:00',
    description: 'Standard check-in time, 24-hour HH:mm',
  })
  @Matches(timeRegex, {
    message: 'Check-in time must be in HH:mm format (00:00 to 23:59)',
  })
  checkInTime!: string;

  @ApiProperty({
    example: '12:00',
    description: 'Standard check-out time, 24-hour HH:mm',
  })
  @Matches(timeRegex, {
    message: 'Check-out time must be in HH:mm format (00:00 to 23:59)',
  })
  checkOutTime!: string;
}
