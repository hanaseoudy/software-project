import { ApiProperty } from '@nestjs/swagger';

export class RoomResponseDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc01' })
  id!: string;

  @ApiProperty({ example: '675f1b2c9d3e4a00aabbccdd' })
  hotelId!: string;

  @ApiProperty({ example: 'A101' })
  roomNumber!: string;

  @ApiProperty({ example: 'Double' })
  type!: string;

  @ApiProperty({ example: 2 })
  beds!: number;

  @ApiProperty({ example: 3 })
  maxOccupancy!: number;

  @ApiProperty({ example: 1500.5 })
  pricePerNight!: number;

  @ApiProperty({ example: 'USD', description: 'Platform currency (PAY-04)' })
  currency!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
