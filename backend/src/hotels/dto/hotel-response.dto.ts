import { ApiProperty } from '@nestjs/swagger';

export class HotelResponseDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbccdd' })
  id!: string;

  @ApiProperty({ example: 'Nile Palace Hotel' })
  name!: string;

  @ApiProperty({ example: 'A five-star hotel on the Nile corniche.' })
  description!: string;

  @ApiProperty({ example: '1 Corniche El Nil Street' })
  address!: string;

  @ApiProperty({ example: '675f1b2c9d3e4a0012345678' })
  city!: string;

  @ApiProperty({ example: '675f1b2c9d3e4a0087654321' })
  country!: string;

  @ApiProperty({ example: 5 })
  starRating!: number;

  @ApiProperty({ type: [String], example: ['wifi', 'pool'] })
  amenities!: string[];

  @ApiProperty({ type: [String], example: ['https://example.com/hotel-1.jpg'] })
  images!: string[];

  @ApiProperty({ example: '14:00' })
  checkInTime!: string;

  @ApiProperty({ example: '12:00' })
  checkOutTime!: string;

  @ApiProperty({ example: 0 })
  averageRating!: number;

  @ApiProperty({ example: 0 })
  reviewCount!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
