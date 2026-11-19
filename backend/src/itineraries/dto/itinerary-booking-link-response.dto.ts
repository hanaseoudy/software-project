import { ApiProperty } from '@nestjs/swagger';
import { BookingType } from '../../payments/enums/payment.enums';
export class BookingAllocationDto {
  @ApiProperty() dayId!: string;
  @ApiProperty({ format: 'date', type: String }) date!: string;
  @ApiProperty({ enum: ['ACCOMMODATION', 'INTERCITY_TRANSPORT'] }) category!:
    'ACCOMMODATION' | 'INTERCITY_TRANSPORT';
  @ApiProperty({ minimum: 0 }) amount!: number;
}
export class ItineraryBookingLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() itineraryId!: string;
  @ApiProperty({ enum: BookingType }) bookingType!: BookingType;
  @ApiProperty() bookingId!: string;
  @ApiProperty({ nullable: true, type: String }) bookingReference!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) bookingStatus!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'INACCESSIBLE'] }) state!:
    'ACTIVE' | 'INACTIVE' | 'INACCESSIBLE';
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ nullable: true, type: String }) currency!: string | null;
  @ApiProperty({ nullable: true, type: Number }) bookingAmount!: number | null;
  @ApiProperty({ type: [String] }) dayIds!: string[];
  @ApiProperty({ type: [BookingAllocationDto] })
  allocations!: BookingAllocationDto[];
}
