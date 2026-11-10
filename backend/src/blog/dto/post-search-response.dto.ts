import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// BLG-09: response DTOs for GET /api/posts/search
export class PostSearchAuthorDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012a3b4c1' })
  id!: string;

  @ApiProperty({ example: 'Maya Haitham' })
  name!: string;
}

export class PostSearchItemDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012a3b4c5' })
  id!: string;

  @ApiProperty({ example: 'Three days in Luxor' })
  title!: string;

  @ApiProperty({ type: PostSearchAuthorDto })
  author!: PostSearchAuthorDto;

  @ApiProperty({ example: '2026-11-10T09:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    example: 'We started the morning at Karnak Temple and spent the afternoon on the West Bank...',
    description: 'First 150 characters of the post, cut at a word boundary, with "..." if longer',
  })
  excerpt!: string;

  @ApiProperty({ example: 12 })
  likesCount!: number;

  @ApiProperty({ example: 4 })
  commentsCount!: number;

  @ApiProperty({ example: 16, description: 'likesCount + commentsCount (results are sorted by this, then newest first)' })
  interactionScore!: number;

  @ApiProperty({ type: [String], example: ['egypt', 'history'] })
  tags!: string[];
}

export class PostSearchResponseDto {
  @ApiProperty({ type: [PostSearchItemDto] })
  items!: PostSearchItemDto[];

  @ApiProperty({ example: 23 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiPropertyOptional({ example: 'No results', description: 'Only present when nothing matched' })
  message?: string;
}
