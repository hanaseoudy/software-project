import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId } from 'class-validator';
import { BookingType } from '../enums/payment.enums';

/** PAY-01: start paying for a Pending Payment booking. */
export class CreatePaymentDto {
  @ApiProperty({ enum: BookingType, example: BookingType.FLIGHT })
  @IsEnum(BookingType, { message: 'Booking type must be flight or hotel' })
  bookingType!: BookingType;

  @ApiProperty({ example: '665f1c2e8b3c4a0012345678', description: 'Flight booking or hotel reservation ID' })
  @IsMongoId({ message: 'Booking ID must be a valid ID' })
  bookingId!: string;
}
