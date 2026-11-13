import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from './is-calendar-date.decorator';

export class HoldRoomDto {
  @ApiProperty({ description: 'Room id' })
  @IsMongoId()
  roomId: string;

  @ApiProperty({ example: 2, description: 'HTL-16: at least one adult in the whole reservation' })
  @IsInt()
  @Min(0)
  adults: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  children: number;
}

export class HoldHotelBookingDto {
  @ApiProperty({ description: 'Hotel id (all rooms must belong to it)' })
  @IsMongoId()
  hotelId: string;

  @ApiProperty({ example: '2026-12-20' })
  @IsCalendarDate()
  checkIn: string;

  @ApiProperty({ example: '2026-12-23' })
  @IsCalendarDate()
  checkOut: string;

  @ApiProperty({ type: [HoldRoomDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HoldRoomDto)
  rooms: HoldRoomDto[];
}
