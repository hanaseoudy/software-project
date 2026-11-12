import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingType, PaymentStatus } from '../enums/payment.enums';

/** PAY-01: payment as returned to its owner. */
export class PaymentResponseDto {
  @ApiProperty({ example: '665f1c2e8b3c4a0012345678' })
  id!: string;

  @ApiProperty({ enum: BookingType })
  bookingType!: BookingType;

  @ApiProperty({ example: '665f1c2e8b3c4a0012345679' })
  bookingId!: string;

  @ApiProperty({ example: 250.5, description: 'Amount in major units (e.g. dollars)' })
  amount!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiPropertyOptional({ example: 'pi_3Nxyz...' })
  stripePaymentIntentId?: string;

  @ApiPropertyOptional({ example: 'Your card was declined.' })
  failureReason?: string;

  @ApiProperty({ example: 0 })
  retryCount!: number;

  @ApiPropertyOptional({ description: 'When the booking hold (and this payment) expires' })
  expiresAt?: Date;

  @ApiPropertyOptional()
  paidAt?: Date;
}

/** PAY-01: returned when a payment is started or retried. */
export class PaymentSessionResponseDto extends PaymentResponseDto {
  @ApiProperty({
    description: 'Pass this to Stripe Elements on the frontend to collect the card. Card details never reach our backend.',
    example: 'pi_3Nxyz_secret_abc',
  })
  clientSecret!: string;
}
