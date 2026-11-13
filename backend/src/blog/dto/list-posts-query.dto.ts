import { IntersectionType, PartialType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { TagParamDto } from './tag-query.dto';

// BLG-02: GET /api/posts?tag=&page=. The optional tag uses the same rules as the clickable tag (BLG-08):
// trimmed, lowercase, not empty, at most 30 characters. Page size is fixed at 10 (GEN-05).
export class ListPostsQueryDto extends IntersectionType(PaginationQueryDto, PartialType(TagParamDto)) {}
