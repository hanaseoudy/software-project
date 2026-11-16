import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/pagination/pagination';
import { PostStatus } from '../schemas/post.schema';

// BLG-08: one post in the list of posts with a given tag
export class TagPostSummaryDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', description: 'Author user id' })
  author!: string;

  @ApiProperty({ type: [String], example: ['egypt', 'history'] })
  tags!: string[];

  @ApiProperty({ enum: PostStatus, example: PostStatus.PUBLISHED })
  status!: PostStatus;

  @ApiProperty({ example: 3 })
  likesCount!: number;

  @ApiProperty({ example: 1 })
  commentsCount!: number;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  createdAt!: Date;
}

// BLG-08: one tag used by published posts, with how many posts use it
export class TagSummaryDto {
  @ApiProperty({ example: 'egypt' })
  name!: string;

  @ApiProperty({ example: 7 })
  postsCount!: number;
}

// GEN-05: shared paginated shape with the items typed
export type TagPostsPage = Omit<PaginatedResponseDto, 'items'> & { items: TagPostSummaryDto[] };
export type TagsPage = Omit<PaginatedResponseDto, 'items'> & { items: TagSummaryDto[] };
