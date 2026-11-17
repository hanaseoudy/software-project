import { ApiProperty } from '@nestjs/swagger';
import { PostImageResponseDto } from './post-response.dto';

// BLG-10: the image just attached to a post
export class AttachedImageResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718', description: 'Image id, used to remove it' })
  id!: string;

  @ApiProperty({
    example: '/api/uploads/post/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b.jpg',
    description: 'URL the stored image is served from (GEN-08)',
  })
  url!: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  postId!: string;
}

// BLG-10: result of removing an image, with the post's remaining images
export class RemovedImageResponseDto {
  @ApiProperty({ example: 'Image removed' })
  message!: string;

  @ApiProperty({ type: [PostImageResponseDto] })
  images!: PostImageResponseDto[];
}
