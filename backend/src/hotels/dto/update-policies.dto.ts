import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, Matches, ValidateIf } from 'class-validator';
import { timeRegex } from '../schemas/validators';
import { CancellationTierDto } from './update-cancellation-tiers.dto';

// A field that was not sent is skipped; a field that was sent (even null) is checked.
const sent = (_object: unknown, value: unknown) => value !== undefined;

/**
 * HTL-09 + HTL-10: the hotel policies in one request (the contract's PUT /hotels/:id/policies).
 * Send any of the three fields; fields that are not sent keep their current value.
 */
export class UpdatePoliciesDto {
  @ApiPropertyOptional({
    example: '14:00',
    description: 'Standard check-in time, 24-hour HH:mm (HTL-09)',
  })
  @ValidateIf(sent)
  @Matches(timeRegex, {
    message: 'Check-in time must be in HH:mm format (00:00 to 23:59)',
  })
  checkInTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: 'Standard check-out time, 24-hour HH:mm (HTL-09)',
  })
  @ValidateIf(sent)
  @Matches(timeRegex, {
    message: 'Check-out time must be in HH:mm format (00:00 to 23:59)',
  })
  checkOutTime?: string;

  @ApiPropertyOptional({
    type: [CancellationTierDto],
    maxItems: 20,
    description:
      'The complete list of cancellation tiers (HTL-10). It replaces the existing list; send an empty list to remove all tiers.',
    example: [
      { daysBeforeCheckIn: 14, refundPercentage: 100 },
      { daysBeforeCheckIn: 7, refundPercentage: 50 },
      { daysBeforeCheckIn: 0, refundPercentage: 0 },
    ],
  })
  @ValidateIf(sent)
  @IsArray({ message: 'Cancellation tiers must be a list' })
  @ArrayMaxSize(20, { message: 'At most 20 tiers are allowed' })
  cancellationTiers?: CancellationTierDto[];
}

/** Response of the policies endpoint. */
export class PoliciesResponseDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbccdd' })
  id!: string;

  @ApiProperty({ example: '14:00' })
  checkInTime!: string;

  @ApiProperty({ example: '12:00' })
  checkOutTime!: string;

  @ApiProperty({ type: [CancellationTierDto] })
  cancellationTiers!: CancellationTierDto[];
}
