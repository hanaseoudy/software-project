import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/pagination/pagination';

// BLG-09: public author info, display name only. A missing account shows as "Deleted user" without an id.
export class PostSearchAuthorDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', nullable: true, type: String, description: 'Null for a deleted user' })
  id!: string | null;

  @ApiProperty({ example: 'Mona Adel' })
  name!: string;
}

// BLG-09: one search result (title, author, date and excerpt, plus tags and interaction counts)
export class PostSearchItemDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ type: PostSearchAuthorDto })
  author!: PostSearchAuthorDto;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    example: 'We started the morning at Karnak Temple...',
    description: 'First 200 characters of the body; "..." is added only when it was cut',
  })
  excerpt!: string;

  @ApiProperty({ type: [String], example: ['egypt', 'history'] })
  tags!: string[];

  @ApiProperty({ example: 3 })
  likesCount!: number;

  @ApiProperty({ example: 1 })
  commentsCount!: number;
}

// GEN-05: shared paginated shape with the items typed
export type PostSearchPage = Omit<PaginatedResponseDto, 'items'> & { items: PostSearchItemDto[] };
