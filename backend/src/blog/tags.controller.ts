import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';

@ApiTags('Blog')
@Controller('tags')
export class TagsController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({
    summary: 'Search tags with post counts (BLG-08)',
    description:
      'Public. Lists tags used by published posts with how many posts use each. Optional ?search=ro and ?page=2. Page size 10.',
  })
  @ApiResponse({ status: 200, description: 'Page of { tag, postsCount }' })
  list(@Query() query: ListTagsQueryDto) {
    return this.blogService.listTags(query);
  }

  @Get(':tag/posts')
  @ApiOperation({
    summary: 'List published posts with a tag (BLG-08)',
    description:
      'Public. Used when a tag is clicked. Same response as GET /api/posts?tag=. Page size 10.',
  })
  @ApiParam({ name: 'tag', description: 'Tag name, e.g. rome' })
  @ApiResponse({ status: 200, description: 'Page of posts with that tag' })
  postsByTag(@Param('tag') tag: string, @Query() query: ListPostsQueryDto) {
    return this.blogService.listByTag(tag, query);
  }
}
