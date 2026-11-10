import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../common/pagination/pagination';
import { BlogService } from './blog.service';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';

@ApiTags('Blog')
@Controller('tags')
export class TagsController {
  constructor(private readonly blogService: BlogService) {}

  // Public, no login needed
  @Get()
  @ApiOperation({
    summary: 'Search tags with post counts (BLG-08, GEN-05)',
    description: 'Public. Most used first, 10 tags per page. Items are { tag, postsCount }.',
  })
  @ApiResponse({ status: 200, description: 'One page of tags', type: PaginatedResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid page, or search longer than 30 characters' })
  list(@Query() query: ListTagsQueryDto) {
    return this.blogService.listTags(query);
  }

  // Public, no login needed
  @Get(':tag/posts')
  @ApiOperation({
    summary: 'List published posts with a tag (BLG-08, GEN-05)',
    description: 'Public. Newest first, 10 posts per page.',
  })
  @ApiParam({ name: 'tag', example: 'rome' })
  @ApiResponse({ status: 200, description: 'One page of posts with this tag', type: PaginatedResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid page (must be an integer >= 1)' })
  postsByTag(@Param('tag') tag: string, @Query() query: ListPostsQueryDto) {
    return this.blogService.listByTag(tag, query);
  }
} 