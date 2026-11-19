import { ApiProperty } from '@nestjs/swagger';

// HTL-23: a review as returned to its author (no user fields)
export class ReviewResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60900' })
  id!: string;

  @ApiProperty({ example: '6aef955ba30ad0ab222602e9', description: 'The reviewed reservation' })
  reservationId!: string;

  @ApiProperty({ example: '6aef930b9e8df6e7c5a939d1' })
  hotelId!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ example: 'Clean rooms and friendly staff.', nullable: true, type: String })
  comment!: string | null;

  @ApiProperty({ example: '2026-11-17T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-17T10:00:00.000Z' })
  updatedAt!: Date;
}

// HTL-23: DELETE /api/reviews/:id
export class DeleteReviewResponseDto {
  @ApiProperty({ example: 'Review deleted' })
  message!: string;

  @ApiProperty({
    example: 4.5,
    nullable: true,
    type: Number,
    description: 'The hotel average after the delete (0 when no reviews remain); null if it could not be recalculated',
  })
  hotelAverageRating!: number | null;

  @ApiProperty({
    example: 2,
    nullable: true,
    type: Number,
    description: 'Number of ratings after the delete; null if it could not be recalculated',
  })
  hotelRatingsCount!: number | null;
}
