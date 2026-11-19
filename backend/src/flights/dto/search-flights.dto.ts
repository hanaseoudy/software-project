
import {
  IsInt,
  IsNotEmpty,
  Length,
  Matches,
  IsEnum,
  IsOptional,
  Max,
  Min,
  IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CabinClass } from '../../airlines/schemas/airline.schema';
 
export enum FlightSortBy {
  PRICE = 'price',
  DURATION = 'duration',
  DEPARTURE_TIME = 'departureTime',
}
 
export enum SortFlightOrder {
  ASC = 'asc',
  DESC = 'desc',
}
 
export class SearchFlightsDto {
  @ApiProperty({ example: 'CAI' })
  @IsNotEmpty()
  @Length(3, 3, { message: 'Departure airport must be a 3-letter IATA code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  departureAirport: string;
 
  @ApiProperty({ example: 'DXB' })
  @IsNotEmpty()
  @Length(3, 3, { message: 'Departure airport must be a 3-letter IATA code' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  arrivalAirport: string;
 
  @ApiProperty({
    example: '2026-12-05',
    description: 'Local date at the departure airport',
  })
  // "2026-12-01" -> the LOCAL date at the departure airport
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'departureDate must be YYYY-MM-DD',
  })
  departureDate: string;
 
  @ApiPropertyOptional({
    example: '2026-12-05',
    description: 'Local date at the departure airport',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  returnDate?: string;
 
  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults: number;
 
  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  children?: number = 0;
 
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infants?: number = 0;
 
  @ApiPropertyOptional({ enum: CabinClass })
  @IsOptional()
  @IsEnum(CabinClass)
  cabinClass?: CabinClass;
 
  @ApiPropertyOptional({
    example: 100,
    description: 'Inclusive minimum cabin price (USD)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;
 
  @ApiPropertyOptional({
    example: 500,
    description: 'Inclusive maximum cabin price (USD)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;
 
  @ApiPropertyOptional({
    enum: FlightSortBy,
    default: FlightSortBy.DEPARTURE_TIME,
    description: 'Sort results by price, duration, or departureTime',
  })
  @IsOptional()
  @IsEnum(FlightSortBy)
  sortBy?: FlightSortBy = FlightSortBy.DEPARTURE_TIME;
 
  @ApiPropertyOptional({
    enum: SortFlightOrder,
    default: SortFlightOrder.ASC,
    description: 'Sort direction (asc or desc)',
  })
  @IsOptional()
  @IsEnum(SortFlightOrder)
  sortOrder?: SortFlightOrder = SortFlightOrder.ASC;
}
 