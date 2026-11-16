import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/pagination/pagination';

// BLG-02: public author info, display name only. Deactivated or missing accounts show as "Deleted user" (ACC-12).
export class PublicAuthorDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', nullable: true, type: String, description: 'Null for a deleted user' })
  id!: string | null;

  @ApiProperty({ example: 'Mona Adel' })
  name!: string;
}

// BLG-02: one row of the public post list
export class PublicPostSummaryDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ type: PublicAuthorDto })
  author!: PublicAuthorDto;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: 'We started the morning at Karnak Temple...', description: 'First 200 characters of the body' })
  excerpt!: string;

  @ApiProperty({ type: [String], example: ['egypt', 'history'] })
  tags!: string[];

  @ApiProperty({ type: [String], example: ['/api/uploads/posts/4f1c.jpg'], description: 'Image URLs' })
  images!: string[];

  @ApiProperty({ example: 3 })
  likesCount!: number;

  @ApiProperty({ example: 1 })
  commentsCount!: number;
}

// BLG-02: a comment shown on the post page (read-only here; creating comments is BLG-05)
export class PublicCommentDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60720' })
  id!: string;

  @ApiProperty({ type: PublicAuthorDto })
  author!: PublicAuthorDto;

  @ApiProperty({ example: 'Great tips, thanks!' })
  text!: string;

  @ApiProperty({ example: '2026-11-09T13:00:00.000Z' })
  createdAt!: Date;
}

// BLG-02: the public post page
export class PublicPostDetailDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ type: PublicAuthorDto })
  author!: PublicAuthorDto;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: 'We started the morning at Karnak Temple...', description: 'Post body' })
  content!: string;

  @ApiProperty({ type: [String], example: ['egypt', 'history'] })
  tags!: string[];

  @ApiProperty({ type: [String], example: ['/api/uploads/posts/4f1c.jpg'], description: 'Image URLs' })
  images!: string[];

  @ApiProperty({ example: 3 })
  likesCount!: number;

  @ApiProperty({ type: [PublicCommentDto], description: 'Visible comments, oldest first' })
  comments!: PublicCommentDto[];
}

// GEN-05: shared paginated shape with the items typed
export type PublicPostsPage = Omit<PaginatedResponseDto, 'items'> & { items: PublicPostSummaryDto[] };
