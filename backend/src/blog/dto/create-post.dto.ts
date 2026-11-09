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
  @ApiProperty({ example: 'My trip to Rome' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'We started the day at the Colosseum...' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  content: string;

  // BLG-08: up to 5 tags, max 30 characters each (trimmed, lowercase, no duplicates)
  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    example: ['rome', 'food'],
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Multipart clients send tags as a JSON array in a text field.
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return value; // IsArray reports malformed input.
      }
    }
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : t))
              .filter((t) => t !== ''),
          ),
        ]
      : value;
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.DRAFT })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}
