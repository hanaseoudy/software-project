import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, ValidateIf } from 'class-validator';

export const ITINERARY_ID_MESSAGE = 'Itinerary id must be a valid id, or null to remove the itinerary';

// BLG-13 (optional): attach one of my itineraries to my post, or remove it with null.
// The field is required: a missing value is rejected instead of being treated as a removal.
export class AttachItineraryDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '6650f1c2a1b2c3d4e5f60720',
    description: 'Id of one of your own itineraries, or null to remove the attached itinerary',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsMongoId({ message: ITINERARY_ID_MESSAGE })
  itineraryId!: string | null;
}
