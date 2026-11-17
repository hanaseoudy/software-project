import { ApiProperty } from '@nestjs/swagger';

/** HTL-11: one hotel in the search results. */
export class HotelSearchResultDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbccdd' })
  id!: string;

  @ApiProperty({ example: 'Nile Palace' })
  name!: string;

  @ApiProperty({ example: '1 Corniche El Nil Street' })
  address!: string;

  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc01', description: 'City id' })
  city!: string;

  @ApiProperty({
    example: '675f1b2c9d3e4a00aabbcc02',
    description: 'Country id',
  })
  country!: string;

  @ApiProperty({ example: 5 })
  starRating!: number;

  @ApiProperty({
    example: '/api/uploads/hotel/5f1c.jpg',
    nullable: true,
    description: 'First hotel photo, or null when the hotel has none',
  })
  image!: string | null;

  @ApiProperty({ example: 4.5 })
  averageRating!: number;

  @ApiProperty({ example: 12 })
  reviewCount!: number;

  @ApiProperty({
    example: 3,
    description: 'How many rooms of this hotel are free for the whole stay',
  })
  availableRooms!: number;

  @ApiProperty({
    example: 1500,
    description:
      'Price per night (USD) of the cheapest room that is free for the stay',
  })
  lowestPricePerNight!: number;
}

/** GEN-05: one page (10 hotels) of search results. */
export class HotelSearchPageDto {
  @ApiProperty({
    type: [HotelSearchResultDto],
    description: 'Up to 10 hotels of the current page',
  })
  items!: HotelSearchResultDto[];

  @ApiProperty({ example: 42, description: 'Total number of matching hotels' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;
}
