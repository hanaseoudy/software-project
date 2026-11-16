import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { MAX_TAG_LENGTH } from '../tag-rules';

const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// BLG-08: the :tag path parameter of GET /api/tags/:tag/posts
export class TagParamDto {
  @ApiProperty({ example: 'egypt', maxLength: MAX_TAG_LENGTH })
  @Transform(normalize)
  @IsString({ message: 'Tag must be text' })
  @IsNotEmpty({ message: 'Tag is required' })
  @MaxLength(MAX_TAG_LENGTH, { message: `Tag must be at most ${MAX_TAG_LENGTH} characters` })
  tag!: string;
}

// BLG-08: GET /api/tags?search=&page= (page size fixed at 10, GEN-05)
export class TagSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'egy', maxLength: MAX_TAG_LENGTH, description: 'Text the tag name contains' })
  @IsOptional()
  @Transform(normalize)
  @IsString({ message: 'Search must be text' })
  @MaxLength(MAX_TAG_LENGTH, { message: `Search must be at most ${MAX_TAG_LENGTH} characters` })
  search?: string;
}
