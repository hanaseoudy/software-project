import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class PassengerSeatDto {
  @ApiProperty({ example: '6b2e8b5f1234567890abcdef' })
  @IsMongoId()
  passengerId: string;

  @ApiProperty({ example: '12A' })
  @IsString()
  @Matches(/^[1-9]\d*[A-Z]$/, {
    message: 'seatNumber must use a row number and uppercase letter, for example 12A',
  })
  seatNumber: string;
}

export class SelectFlightSeatsDto {
  @ApiProperty({ type: [PassengerSeatDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PassengerSeatDto)
  passengers: PassengerSeatDto[];
}
