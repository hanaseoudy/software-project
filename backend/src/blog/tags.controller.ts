import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { PaginatedResponseDto, PaginationQueryDto } from '../common/pagination/pagination';
import { BlogService } from './blog.service';
import { TagParamDto, TagSearchQueryDto } from './dto/tag-query.dto';
import { TagPostSummaryDto, TagSummaryDto } from './dto/tag-response.dto';
import type { TagPostsPage, TagsPage } from './dto/tag-response.dto';

// BLG-08: public tag endpoints (no login needed)
@ApiTags('blog')
@ApiExtraModels(PaginatedResponseDto, TagPostSummaryDto, TagSummaryDto)
@Controller('tags')
export class TagsController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({
    summary: 'Search tags (BLG-08)',
    description:
      'Lists the tags used by published posts, with how many posts use each, filtered by the text the tag ' +
      'contains. Most used first, then by name. Paginated with a fixed page size of 10 (GEN-05). ' +
      'Supporting endpoint for "tags are searchable"; keyword search of posts is BLG-09.',
  })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'egy' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiOkResponse({
    description: 'One page of tags',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResponseDto) },
        { properties: { items: { type: 'array', items: { $ref: getSchemaPath(TagSummaryDto) } } } },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid search text or page number',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { search: ['Search must be at most 30 characters'] } },
  })
  search(@Query() query: TagSearchQueryDto): Promise<TagsPage> {
    return this.blogService.searchTags(query.search, query.page ?? 1);
  }

  @Get(':tag/posts')
  @ApiOperation({
    summary: 'List published posts with a tag (BLG-08)',
    description:
      'Clickable tag: returns the published, non-hidden posts that have this tag, newest first. ' +
      'The tag is matched trimmed and lowercase. Paginated with a fixed page size of 10 (GEN-05).',
  })
  @ApiParam({ name: 'tag', description: 'Tag name, 1 to 30 characters', example: 'egypt' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiOkResponse({
    description: 'One page of posts with the tag',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResponseDto) },
        { properties: { items: { type: 'array', items: { $ref: getSchemaPath(TagPostSummaryDto) } } } },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid tag or page number',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { tag: ['Tag must be at most 30 characters'] } },
  })
  listPosts(@Param() params: TagParamDto, @Query() query: PaginationQueryDto): Promise<TagPostsPage> {
    return this.blogService.listByTag(params.tag, query.page ?? 1);
  }
}
