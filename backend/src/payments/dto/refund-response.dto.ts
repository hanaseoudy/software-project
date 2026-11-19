import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType, RefundStatus } from '../enums/payment.enums';

/** PAY-03: refund as returned to its owner. */
export class RefundResponseDto {
  @ApiProperty({ example: '665f1c2e8b3c4a0012345678' })
  id!: string;

  @ApiProperty({ example: '665f1c2e8b3c4a0012345670' })
  paymentId!: string;

  @ApiProperty({ enum: BookingType })
  bookingType!: BookingType;

  @ApiProperty({ example: '665f1c2e8b3c4a0012345679' })
  bookingId!: string;

  @ApiProperty({ example: 60.25, description: 'Refund amount in major units (e.g. dollars)' })
  amount!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ enum: RefundStatus, description: 'Pending, Refunded or Failed' })
  status!: RefundStatus;

  @ApiPropertyOptional({ example: 'Cancelled by user' })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Policy tier used to compute the amount',
    example: { daysBeforeDeparture: 7, refundPercent: 50 },
  })
  appliedPolicy?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'When Stripe finished the refund (Refunded or Failed)' })
  processedAt?: Date;
}
