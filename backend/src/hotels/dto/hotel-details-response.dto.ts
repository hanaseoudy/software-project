import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationTierDto } from './update-cancellation-tiers.dto';

export class HotelReviewDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc01' })
  id!: string;

  @ApiProperty({
    example: 'Sara M.',
    description: 'First name and last initial',
  })
  reviewer!: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ example: 'Clean rooms and friendly staff.' })
  comment!: string;

  @ApiProperty({ example: '2026-11-01T10:00:00.000Z' })
  createdAt!: string;
}

export class AvailableRoomDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc02' })
  id!: string;

  @ApiProperty({ example: 'A101' })
  roomNumber!: string;

  @ApiProperty({ example: 'Double' })
  type!: string;

  @ApiProperty({ example: 2 })
  beds!: number;

  @ApiProperty({ example: 3 })
  maxOccupancy!: number;

  @ApiProperty({ example: 1500 })
  pricePerNight!: number;
}

/** HTL-02: everything shown on the hotel details page. */
export class HotelDetailsResponseDto {
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

  @ApiProperty({ type: [CancellationTierDto] })
  cancellationTiers!: CancellationTierDto[];

  @ApiProperty({ example: 4.5 })
  averageRating!: number;

  @ApiProperty({ example: 12 })
  reviewCount!: number;

  @ApiProperty({
    type: [HotelReviewDto],
    description: 'The 10 most recent visible reviews',
  })
  reviews!: HotelReviewDto[];

  @ApiPropertyOptional({
    type: [AvailableRoomDto],
    description:
      'Only present when checkIn and checkOut were sent: rooms free for the whole stay',
  })
  availableRooms?: AvailableRoomDto[];
}
