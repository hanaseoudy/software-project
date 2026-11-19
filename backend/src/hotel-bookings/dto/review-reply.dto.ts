import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** HTL-26: POST /api/reviews/:id/reply */
export class ReplyToReviewDto {
  @ApiProperty({
    example: 'Thank you for staying with us, we are glad you enjoyed it.',
    maxLength: 1000,
    description: 'The reply, 1 to 1000 characters (spaces around it are removed)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : (value ?? ''),
  )
  @IsString({ message: 'Reply must be text' })
  @IsNotEmpty({ message: 'Reply is required' })
  @MaxLength(1000, { message: 'Reply must be at most 1000 characters' })
  text!: string;
}

export class ReviewReplyDto {
  @ApiProperty({ example: 'Thank you for staying with us.' })
  text!: string;

  @ApiProperty({ example: '6aef0000000000000000bbbb', description: 'The moderator who replied' })
  moderator!: string;

  @ApiProperty({ example: '2026-11-18T10:00:00.000Z' })
  repliedAt!: string;
}

export class ReviewWithReplyDto {
  @ApiProperty({ example: '6aef955ba30ad0ab222602e9' })
  id!: string;

  @ApiProperty({ example: '6aef930b9e8df6e7c5a939d1' })
  hotel!: string;

  @ApiProperty({ example: 5 })
  rating!: number;

  @ApiProperty({ example: 'Great stay', nullable: true })
  comment!: string | null;

  @ApiProperty({ type: ReviewReplyDto })
  reply!: ReviewReplyDto;
}
