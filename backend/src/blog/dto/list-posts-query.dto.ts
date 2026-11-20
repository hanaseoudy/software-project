import { ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { TagParamDto } from './tag-query.dto';

// BLG-09: defensive upper bound on the search keyword (not in the requirement sheet)
const MAX_SEARCH_LENGTH = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// BLG-02: GET /api/posts?tag=&search=&page=. The optional tag uses the same rules as the clickable tag (BLG-08):
// trimmed, lowercase, not empty, at most 30 characters. Page size is fixed at 10 (GEN-05).
// BLG-09: the optional search keyword is trimmed, not empty and at most 100 characters.
export class ListPostsQueryDto extends IntersectionType(PaginationQueryDto, PartialType(TagParamDto)) {
  @ApiPropertyOptional({
    example: 'luxor',
    maxLength: MAX_SEARCH_LENGTH,
    description: 'Keyword matched (case-insensitive, partial) in the title, the tags or the author name',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Search must be text' })
  @IsNotEmpty({ message: 'Search cannot be empty' })
  @MaxLength(MAX_SEARCH_LENGTH, { message: `Search must be at most ${MAX_SEARCH_LENGTH} characters` })
  search?: string;
}
