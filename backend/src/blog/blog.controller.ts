
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post()
  @ApiOperation({ summary: 'Create a post as draft or published (BLG-01)' })
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.blogService.createPost(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Browse published posts, filter by tag (BLG-02)' })
  list(@Query() query: ListPostsQueryDto) {
    return this.blogService.listPublished(query);
  }

  // TODO: Integrate Nour's JWT authentication guard once available.
  @Get('mine')
  @ApiOperation({ summary: 'List my own posts including drafts (BLG-03)' })
  listMine(@Req() req: any, @Query() query: ListPostsQueryDto) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.blogService.listMine(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one published post with comments (BLG-02)' })
  getOne(@Param('id') id: string) {
    return this.blogService.getPublishedById(id);
  }
}
