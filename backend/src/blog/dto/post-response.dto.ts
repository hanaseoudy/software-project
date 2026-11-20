import { ApiProperty } from '@nestjs/swagger';
import { PostStatus } from '../schemas/post.schema';

export class PostImageResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718' })
  id!: string;

  @ApiProperty({ example: '/api/uploads/post/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b.jpg' })
  url!: string;
}

export class PostResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ example: 'We started the morning at Karnak Temple...' })
  content!: string;

  @ApiProperty({ enum: PostStatus, example: PostStatus.DRAFT })
  status!: PostStatus;

  @ApiProperty({ type: [String], example: ['egypt', 'history'] })
  tags!: string[];

  @ApiProperty({ type: [PostImageResponseDto], example: [] })
  images!: PostImageResponseDto[];

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', description: 'Author user id' })
  author!: string;

  @ApiProperty({ example: 0 })
  likesCount!: number;

  @ApiProperty({ example: 0 })
  commentsCount!: number;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  updatedAt!: Date;
}