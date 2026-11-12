import { ApiProperty } from '@nestjs/swagger';
import { PostStatus } from '../schemas/post.schema';

// BLG-03: one row of the author's own post list (title, status, date, like count, comment count)
export class MyPostSummaryDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ enum: PostStatus, example: PostStatus.DRAFT })
  status!: PostStatus;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z', description: 'Date the post was created' })
  createdAt!: Date;

  @ApiProperty({ example: 3 })
  likesCount!: number;

  @ApiProperty({ example: 1 })
  commentsCount!: number;
}

// GEN-05: paginated list with a fixed page size of 10
export class MyPostsPageDto {
  @ApiProperty({ type: [MyPostSummaryDto] })
  items!: MyPostSummaryDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
