import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { SEARCH_MAX_LENGTH, searchTextError } from '../search-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// GET /api/posts?search=&page= (BLG-09). Page size is fixed at 10 (GEN-05).
export class ListPostsQueryDto extends PaginationQueryDto {
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
