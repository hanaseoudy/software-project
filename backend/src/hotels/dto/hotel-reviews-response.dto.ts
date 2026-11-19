import { ApiProperty } from '@nestjs/swagger';
import { PAGE_SIZE } from '../../common/pagination/pagination';

// HTL-24: public reviewer info, display name only. ACC-12: deactivated or missing accounts show as "Deleted user".
export class HotelReviewerDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', nullable: true, type: String, description: 'Null for a deleted user' })
  id!: string | null;

  @ApiProperty({ example: 'Sara M.', description: 'First name and last initial, or "Deleted user"' })
  name!: string;
}

// HTL-26: the hotel moderator's public reply to a review (the moderator's id is not shown)
export class HotelReviewReplyDto {
  @ApiProperty({ example: 'Thank you for staying with us.' })
  text!: string;

  @ApiProperty({ example: '2026-11-18T10:00:00.000Z' })
  repliedAt!: Date;
}

// HTL-24: one visible review of the hotel
export class HotelReviewItemDto {
  @ApiProperty({ example: '675f1b2c9d3e4a00aabbcc01' })
  id!: string;

  @ApiProperty({ type: HotelReviewerDto })
  reviewer!: HotelReviewerDto;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ example: 'Clean rooms and friendly staff.', nullable: true, type: String })
  comment!: string | null;

  @ApiProperty({ example: '2026-11-01T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-01T10:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    type: HotelReviewReplyDto,
    nullable: true,
    description: 'HTL-26: the hotel moderator\'s reply, or null when there is none',
  })
  reply!: HotelReviewReplyDto | null;
}

// HTL-24: the hotel's average rating and number of ratings, with one page of its reviews (GEN-05)
export class HotelReviewsPageDto {
  @ApiProperty({ example: '6aef930b9e8df6e7c5a939d1' })
  hotelId!: string;

  @ApiProperty({ example: 4.25, description: 'Average rating, 2 decimals; 0 when the hotel has no ratings yet' })
  averageRating!: number;

  @ApiProperty({ example: 12, description: 'Number of ratings' })
  ratingsCount!: number;

  @ApiProperty({ type: [HotelReviewItemDto], description: 'Up to 10 reviews, newest first' })
  items!: HotelReviewItemDto[];

  @ApiProperty({ example: 12, description: 'Number of visible reviews' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
