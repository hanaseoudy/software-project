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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// BLG-01: create a post with a required title and body, optional tags, as Draft or Published.
// Tag limits (max 5 tags, max 30 characters each) come from BLG-08.
export class CreatePostDto {
  @ApiProperty({ example: 'Three days in Luxor', maxLength: 200 })
  @Transform(trim)
  @IsString({ message: 'Title must be text' })
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200, { message: 'Title must be at most 200 characters' })
  title!: string;

  @ApiProperty({ example: 'We started the morning at Karnak Temple...', description: 'Post body' })
  @Transform(trim)
  @IsString({ message: 'Body must be text' })
  @IsNotEmpty({ message: 'Body is required' })
  content!: string;

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.DRAFT })
  @IsOptional()
  @IsEnum(PostStatus, { message: 'Status must be draft or published' })
  status?: PostStatus;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    example: ['egypt', 'history'],
    description: 'Up to 5 tags, each at most 30 characters; stored trimmed, lowercase and without duplicates',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? [...new Set(value.map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : tag)))]
      : value,
  )
  @IsArray({ message: 'Tags must be a list' })
  @ArrayMaxSize(5, { message: 'A post can have at most 5 tags' })
  @IsString({ each: true, message: 'Each tag must be text' })
  @IsNotEmpty({ each: true, message: 'Tags cannot be empty' })
  @MaxLength(30, { each: true, message: 'Each tag must be at most 30 characters' })
  tags?: string[];
}