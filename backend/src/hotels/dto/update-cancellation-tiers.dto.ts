import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray } from 'class-validator';

/** One cancellation tier. Each tier is checked in the service (see HotelsService). */
export class CancellationTierDto {
  @ApiProperty({
    example: 7,
    minimum: 0,
    description:
      'Days before check-in (whole number, 0 or more). Must be unique.',
  })
  daysBeforeCheckIn!: number;

  @ApiProperty({
    example: 50,
    minimum: 0,
    maximum: 100,
    description: 'Refund percentage, from 0 to 100',
  })
  refundPercentage!: number;
}

/** HTL-10: the full list of cancellation tiers for a hotel. */
export class UpdateCancellationTiersDto {
  @ApiProperty({
    type: [CancellationTierDto],
    maxItems: 20,
    description:
      'The complete list of tiers. It replaces the existing list; send an empty list to remove all tiers.',
    example: [
      { daysBeforeCheckIn: 14, refundPercentage: 100 },
      { daysBeforeCheckIn: 7, refundPercentage: 50 },
      { daysBeforeCheckIn: 0, refundPercentage: 0 },
    ],
  })
  @IsArray({ message: 'Tiers must be a list' })
  @ArrayMaxSize(20, { message: 'At most 20 tiers are allowed' })
  tiers!: CancellationTierDto[];
}

/** Response of the cancellation tiers endpoint. */
export class CancellationTiersResponseDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbccdd' })
  id!: string;

  @ApiProperty({ type: [CancellationTierDto] })
  cancellationTiers!: CancellationTierDto[];
}
