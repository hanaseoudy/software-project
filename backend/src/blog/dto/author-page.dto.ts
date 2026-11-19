import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { PaginatedResponseDto } from '../../common/pagination/pagination';
import { PublicPostSummaryDto } from './public-post-response.dto';

// BLG-12: the :id path parameter of GET /api/authors/:id
export class AuthorIdParamDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', description: 'Author (user) id' })
  @IsMongoId({ message: 'Author id must be a valid id' })
  id!: string;
}

// BLG-12: one public itinerary of the author (ITN-20)
export class ItineraryCardDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60a00' })
  id!: string;

  @ApiProperty({ example: 'A week in Upper Egypt' })
  title!: string;

  @ApiProperty({ type: [String], example: ['EG'], description: 'Country codes' })
  countries!: string[];

  @ApiProperty({ type: String, format: 'date', example: '2027-02-10' })
  startDate!: string;

  @ApiProperty({ example: '2026-11-10T09:30:00.000Z' })
  updatedAt!: Date;
}

// BLG-12: the author's published posts, the same items as GET /api/posts (BLG-02), page size 10 (GEN-05)
export class AuthorPostsPageDto extends PaginatedResponseDto {
  @ApiProperty({ type: [PublicPostSummaryDto], description: 'Up to 10 published posts, newest first' })
  declare items: PublicPostSummaryDto[];
}

// BLG-12: the public author page. Only the display name and join date are shown, never private fields.
export class AuthorPageDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700' })
  authorId!: string;

  @ApiProperty({ example: 'Mona Adel' })
  name!: string;

  @ApiProperty({ example: '2026-10-01T08:00:00.000Z', description: 'When the account was created' })
  joinDate!: Date;

  @ApiProperty({ type: AuthorPostsPageDto })
  posts!: AuthorPostsPageDto;

  @ApiProperty({ type: [ItineraryCardDto], description: 'Up to 10 public itineraries, most recently updated first' })
  publicItineraries!: ItineraryCardDto[];
}
