import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CancelFlightDto {
  @ApiProperty({
    example: true,
    description: 'Explicit confirmation required to cancel the flight',
  })
  @IsBoolean({ message: 'confirm must be a boolean' })
  @Equals(true, { message: 'Flight cancellation must be explicitly confirmed' })
  confirm: boolean;

  @ApiPropertyOptional({
    example: 'Operational aircraft maintenance',
    description: 'Optional reason for cancelling the flight',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
