import { ApiProperty } from '@nestjs/swagger';
import { PAGE_SIZE } from '../../common/pagination/pagination';

export class AdminAirlineItemDto {
  @ApiProperty({ example: '6aef52048e9d356647b49fdc' })
  id!: string;

  @ApiProperty({ example: 'EgyptAir' })
  name!: string;

  @ApiProperty({ example: 'MS' })
  code!: string;

  @ApiProperty({ example: true, description: 'false when the admin deactivated the airline (ACC-15)' })
  isActive!: boolean;
}

export class AdminHotelItemDto {
  @ApiProperty({ example: '6b003af8c4b40a95248bc519' })
  id!: string;

  @ApiProperty({ example: 'Nile Palace Hotel' })
  name!: string;

  @ApiProperty({ example: true, description: 'false when the admin deactivated the hotel (ACC-15)' })
  isActive!: boolean;
}

export class AdminAirlinesPageDto {
  @ApiProperty({ type: [AdminAirlineItemDto] })
  items!: AdminAirlineItemDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}

export class AdminHotelsPageDto {
  @ApiProperty({ type: [AdminHotelItemDto] })
  items!: AdminHotelItemDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}