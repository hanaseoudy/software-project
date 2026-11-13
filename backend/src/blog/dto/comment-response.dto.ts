import { ApiProperty } from '@nestjs/swagger';

class CommentAuthorDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700' })
  id!: string;
}

// BLG-05: the comment that was just added
export class CommentResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60720' })
  id!: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  postId!: string;

  @ApiProperty({ type: CommentAuthorDto })
  author!: CommentAuthorDto;

  @ApiProperty({ example: 'Great tips, thanks!' })
  text!: string;

  @ApiProperty({ example: '2026-11-13T12:00:00.000Z' })
  createdAt!: Date;
}
