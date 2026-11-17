import { ApiProperty } from '@nestjs/swagger';

/** HTL-15: one room that is free for the whole searched stay. */
export class AvailableRoomDto {
  @ApiProperty({
    example: '675f1b2c9d3e4a00aabbcc01',
    description: 'Room id, used to select the room for booking',
  })
  id!: string;

  @ApiProperty({ example: 'A101' })
  roomNumber!: string;

  @ApiProperty({ example: 'Double' })
  type!: string;

  @ApiProperty({ example: 2 })
  beds!: number;

  @ApiProperty({ example: 3 })
  maxOccupancy!: number;

  @ApiProperty({ example: 100, description: 'Price per night' })
  pricePerNight!: number;

  @ApiProperty({ example: 'USD', description: 'Platform currency (PAY-04)' })
  currency!: string;

  @ApiProperty({ example: 4, description: 'Number of nights in the stay' })
  nights!: number;

  @ApiProperty({
    example: 400,
    description: 'Total stay price: nights x price per night',
  })
  totalStayPrice!: number;
}

/** GEN-05: one page (10 rooms) of available rooms. */
export class AvailableRoomsPageDto {
  @ApiProperty({
    type: [AvailableRoomDto],
    description: 'Up to 10 rooms of the current page',
  })
  items!: AvailableRoomDto[];

  @ApiProperty({ example: 12, description: 'Total number of free rooms' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
