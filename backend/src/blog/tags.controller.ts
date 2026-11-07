import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';

@ApiTags('Blog')
@Controller('tags')
export class TagsController {
  constructor(private readonly blogService: BlogService) {}

  // Public, no login needed
  @Get()
  @ApiOperation({ summary: 'Search tags with post counts (BLG-08)' })
  list(@Query() query: ListTagsQueryDto) {
    return this.blogService.listTags(query);
  }

  // Public, no login needed
  @Get(':tag/posts')
  @ApiOperation({ summary: 'List published posts with a tag (BLG-08)' })
  postsByTag(@Param('tag') tag: string, @Query() query: ListPostsQueryDto) {
    return this.blogService.listByTag(tag, query);
  }
}
