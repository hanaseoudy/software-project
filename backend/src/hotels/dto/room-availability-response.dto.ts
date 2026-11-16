import { ApiProperty } from '@nestjs/swagger';

export class RoomAvailabilityResponseDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc10' })
  id!: string;

  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc01' })
  roomId!: string;

  @ApiProperty({ example: '675f1b2c9d3e4a00aabbccdd' })
  hotelId!: string;

  @ApiProperty({ example: 'available' })
  type!: string;

  @ApiProperty({ example: '2026-12-01' })
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  endDate!: string;
}
