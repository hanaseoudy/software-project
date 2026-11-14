import { ApiProperty } from '@nestjs/swagger';

// BLG-06: result of liking or unliking a post, including the updated like count
export class LikeResponseDto {
  @ApiProperty({ example: true, description: 'Whether the logged-in user now likes the post' })
  liked!: boolean;

  @ApiProperty({ example: 4, minimum: 0, description: 'Current number of likes on the post' })
  likesCount!: number;
}
