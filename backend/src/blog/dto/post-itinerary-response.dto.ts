import { ApiProperty } from '@nestjs/swagger';

// BLG-13 (optional): only ids are returned, never the itinerary's content
export class PostItineraryResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  postId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '6650f1c2a1b2c3d4e5f60720',
    description: 'Id of the attached itinerary, or null when none is attached',
  })
  itineraryId!: string | null;
}
