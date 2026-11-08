import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PostStatus } from '../schemas/post.schema';

export class CreatePostDto {
  @ApiProperty({
    description: 'Post title (required, max 200 characters)',
    example: 'My trip to Rome',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Post body (required)',
    example: 'We started the day at the Colosseum...',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  content: string;

  // BLG-08: up to 5 tags, max 30 characters each (trimmed, lowercase, no duplicates)
  @ApiPropertyOptional({
    description:
      'Up to 5 tags, max 30 characters each. Trimmed, lowercased, duplicates removed.',
    type: [String],
    maxItems: 5,
    example: ['rome', 'food'],
  })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : t))
              .filter((t) => t !== ''),
          ),
        ]
      : value,
  )
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'draft (default) or published',
    enum: PostStatus,
    default: PostStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}
