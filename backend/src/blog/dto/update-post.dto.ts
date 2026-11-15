import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { CreatePostDto } from './create-post.dto';
import { PostStatus } from '../schemas/post.schema';

// BLG-04: omitted fields are unchanged; explicit nulls are invalid.
export class UpdatePostDto extends PartialType(PickType(CreatePostDto, ['title', 'content'] as const), { skipNullProperties: false }) {
  @ApiPropertyOptional({ enum: PostStatus })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PostStatus, { message: 'Status must be draft or published' })
  status?: PostStatus;

  @ApiPropertyOptional({ type: [String], maxItems: 5, description: 'Up to 5 tags, each 1 to 30 characters' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => Array.isArray(value)
    ? [...new Set(value.map(tag => typeof tag === 'string' ? tag.trim().toLowerCase() : tag))] : value)
  @IsArray({ message: 'Tags must be a list' })
  @ArrayMaxSize(5, { message: 'A post can have at most 5 tags' })
  @IsString({ each: true, message: 'Each tag must be text' })
  @IsNotEmpty({ each: true, message: 'Tags cannot be empty' })
  @MaxLength(30, { each: true, message: 'Each tag must be at most 30 characters' })
  tags?: string[];
}
