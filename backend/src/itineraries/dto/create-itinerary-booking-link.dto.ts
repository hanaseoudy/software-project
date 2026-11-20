import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsMongoId,
} from 'class-validator';
import { BookingType } from '../../payments/enums/payment.enums';
export class CreateItineraryBookingLinkDto {
  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;
  @ApiProperty() @IsMongoId() bookingId!: string;
  @ApiProperty({
    type: [String],
    description:
      'Flight: one outbound-arrival day. Hotel: all occupied nights. No duplicates.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ArrayUnique()
  @IsMongoId({ each: true })
  dayIds!: string[];
}
