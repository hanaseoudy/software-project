import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import { TagCountDto } from './dto/tag-count.dto';
import { TagParamDto } from './dto/tag-param.dto';

@ApiTags('Blog')
@Controller('tags')
export class TagsController {
  constructor(private readonly blogService: BlogService) {}

  // Public, no login needed
  @Get()
  @ApiOperation({
    summary: 'Search tags with post counts (BLG-08)',
    description:
      'Public. Returns tags of published posts with how many posts use each tag, most used first.',
  })
  @ApiResponse({ status: 200, description: 'Tags with post counts', type: [TagCountDto] })
  @ApiResponse({ status: 400, description: 'Invalid search or limit (search max 30 characters, limit 1-50)' })
  list(@Query() query: ListTagsQueryDto) {
    return this.blogService.listTags(query);
  }

  // Public, no login needed
  @Get(':tag/posts')
  @ApiOperation({
    summary: 'List published posts with a tag (BLG-08)',
    description: 'Public. Clicking a tag shows the published posts that use it.',
  })
  @ApiParam({ name: 'tag', example: 'rome', description: 'Tag name, 1-30 characters (case-insensitive)' })
  @ApiResponse({ status: 200, description: 'Published posts with this tag' })
  @ApiResponse({ status: 400, description: 'Tag is empty or longer than 30 characters, or invalid page/limit' })
  postsByTag(@Param() params: TagParamDto, @Query() query: ListPostsQueryDto) {
    return this.blogService.listByTag(params.tag, query);
  }
}
