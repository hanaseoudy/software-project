import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class CancelFlightBookingDto {
  @ApiProperty({
    example: true,
    description:
      'Must be true: the user has seen the refund amount (GET :id/cancellation-quote) and confirms the cancellation',
  })
  @IsBoolean()
  confirm: boolean;
}
