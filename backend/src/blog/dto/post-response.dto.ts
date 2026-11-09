import { ApiProperty } from '@nestjs/swagger';
import { PostStatus } from '../schemas/post.schema';

// BLG-01: explicit response structure (no raw Mongoose document)
export class PostResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012a3b4c5' })
  id: string;

  @ApiProperty({ example: 'My trip to Rome' })
  title: string;

  @ApiProperty({ example: 'We started the day at the Colosseum...' })
  content: string;

  @ApiProperty({ description: 'Author user id' })
  author: string;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiProperty({ type: [String], example: ['rome', 'food'] })
  tags: string[];

  @ApiProperty({ type: [String], description: 'Image urls (uploaded via GEN-08)' })
  images: string[];

  @ApiProperty({ example: 0 })
  likesCount: number;

  @ApiProperty({ example: 0 })
  commentsCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export function toPostResponse(post: any): PostResponseDto {
  return {
    id: String(post._id),
    title: post.title,
    content: post.content,
    author: String(post.author),
    status: post.status,
    tags: post.tags ?? [],
    images: (post.images ?? []).map((i: any) => i.url),
    likesCount: post.likesCount ?? 0,
    commentsCount: post.commentsCount ?? 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
