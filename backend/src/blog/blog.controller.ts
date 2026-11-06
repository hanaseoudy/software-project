import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // TODO: add the auth guard from the accounts module here (ACC-04)
  @Post()
  @ApiOperation({ summary: 'Create a post as draft or published (BLG-01)' })
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.blogService.createPost(userId, dto);
  }

  // Public, no login needed
  @Get()
  @ApiOperation({ summary: 'Browse published posts, filter by tag (BLG-02)' })
  list(@Query() query: ListPostsQueryDto) {
    return this.blogService.listPublished(query);
  }

  // NOTE: when you add GET /posts/mine (BLG-03), put it ABOVE this route
  @Get(':id')
  @ApiOperation({ summary: 'Get one published post with comments (BLG-02)' })
  getOne(@Param('id') id: string) {
    return this.blogService.getPublishedById(id);
  }
}
