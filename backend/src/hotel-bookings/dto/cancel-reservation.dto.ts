import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { RefundResponseDto } from '../../payments/dto/refund-response.dto';

const IsRefundAmount = () =>
  ValidateBy({
    name: 'isRefundAmount',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0,
      defaultMessage: () =>
        'Expected refund amount must be a number of 0 or more (use the amount shown by the cancellation quote)',
    },
  });

/** HTL-21: the guest confirms the refund amount they were shown. */
export class CancelReservationDto {
  @ApiProperty({
    example: 330,
    description:
      'The refund amount (USD) shown by GET /hotel-bookings/:id/cancellation-quote. If it no longer matches the current refund the cancellation is refused so the guest can review it again.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsRefundAmount()
  expectedRefundAmount!: number;
}

export class AppliedTierDto {
  @ApiProperty({ example: 7 })
  daysBeforeCheckIn!: number;

  @ApiProperty({ example: 50 })
  refundPercentage!: number;
}

/** HTL-21: what cancelling would refund, shown before the guest confirms. */
export class CancellationQuoteDto {
  @ApiProperty({ example: '6aef955ba30ad0ab222602e9' })
  reservationId!: string;

  @ApiProperty({ example: 'HTL-7K3M9Q', nullable: true })
  bookingReference!: string | null;

  @ApiProperty({ example: '2026-12-20' })
  checkIn!: string;

  @ApiProperty({ example: 660, description: 'Full total of the reservation' })
  totalPrice!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 10, description: 'Whole days from today to the check-in date' })
  daysBeforeCheckIn!: number;

  @ApiProperty({
    type: AppliedTierDto,
    nullable: true,
    description: "The hotel's cancellation tier that applies, or null when no tier applies (0% refund)",
  })
  appliedTier!: AppliedTierDto | null;

  @ApiProperty({ example: 50 })
  refundPercentage!: number;

  @ApiProperty({ example: 330, description: 'Refund on the full total; 0 means nothing is refunded' })
  refundAmount!: number;
}

export class CancelReservationResultDto {
  @ApiProperty({ example: '6aef955ba30ad0ab222602e9' })
  id!: string;

  @ApiProperty({ example: 'HTL-7K3M9Q', nullable: true })
  bookingReference!: string | null;

  @ApiProperty({ example: 'CANCELLED' })
  status!: string;

  @ApiProperty({ example: 330 })
  refundAmount!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({
    type: RefundResponseDto,
    nullable: true,
    description: 'The refund (PAY-03), or null when the refund is 0',
  })
  refund!: RefundResponseDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Set only when the reservation was cancelled but the refund could not be started',
  })
  refundError!: string | null;
}
