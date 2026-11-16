import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsNotFutureDate } from './is-not-future-date.decorator';
import { CabinClass } from '../schemas/flight-booking.schema';
import { DocumentType, PassengerType } from '../schemas/passenger.schema';

export class BaggageItemDto {
  @ApiProperty({ example: 23 })
  @IsNumber()
  @Min(0)
  weightKg: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isExtra?: boolean;
}

export class PassengerDto {
  @ApiProperty({ example: 'Mariam' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Mashoud' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: PassengerType })
  @IsEnum(PassengerType)
  type: PassengerType;

  @ApiProperty({ example: '2002-05-20' })
  @IsDateString()
  @IsNotFutureDate()
  dateOfBirth: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty({ example: 'A12345678' })
  @IsString()
  @IsNotEmpty()
  documentNumber: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ type: [BaggageItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BaggageItemDto)
  baggage?: BaggageItemDto[];
}

export class HoldFlightBookingDto {
  @ApiProperty({ description: 'Outbound flight id' })
  @IsMongoId()
  outboundFlightId: string;

  @ApiPropertyOptional({ description: 'Required when tripType is ROUND_TRIP' })
  @IsOptional()
  @IsMongoId()
  returnFlightId?: string;

  @ApiProperty({ enum: ['ONE_WAY', 'ROUND_TRIP'] })
  @IsEnum(['ONE_WAY', 'ROUND_TRIP'])
  tripType: 'ONE_WAY' | 'ROUND_TRIP';

  @ApiProperty({ enum: CabinClass })
  @IsEnum(CabinClass)
  cabinClass: CabinClass;

  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];
}