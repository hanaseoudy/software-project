import { ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { SEARCH_MAX_LENGTH, searchTextError } from '../search-rules';
import { TagParamDto } from './tag-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// BLG-02 / BLG-09: GET /api/posts?tag=&search=&page=.
// The optional tag uses the same rules as the clickable tag (BLG-08): trimmed, lowercase, not empty,
// at most 30 characters. The optional search keyword is 1 to 100 characters. Page size is fixed at 10 (GEN-05).
export class ListPostsQueryDto extends IntersectionType(PaginationQueryDto, PartialType(TagParamDto)) {
  @ApiPropertyOptional({
    example: 'luxor',
    maxLength: SEARCH_MAX_LENGTH,
    description: 'Keyword matched (case-insensitive, partial) in the title, the tags or the author name',
  })
  @IsOptional()
  @Transform(trim)
  @ValidateBy({
    name: 'isSearchText',
    validator: {
      validate: (value: unknown) => searchTextError(value) === null,
      defaultMessage: (args) => searchTextError(args?.value) ?? 'Invalid search',
    },
  })
  search?: string;
}