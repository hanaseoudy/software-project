import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  private userId(req: any): string {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  // TODO: add the auth guard from the accounts module here (ACC-04)
  @Post()
  @ApiOperation({ summary: 'Create a post as draft or published (BLG-01)' })
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.blogService.createPost(this.userId(req), dto);
  }

  // Public, no login needed
  @Get()
  @ApiOperation({ summary: 'Browse published posts, filter by tag (BLG-02)' })
  list(@Query() query: ListPostsQueryDto) {
    return this.blogService.listPublished(query);
  }

  // Must stay ABOVE @Get(':id'), otherwise "mine" is read as an id
  // TODO: add the auth guard here (ACC-04)
  @Get('mine')
  @ApiOperation({ summary: 'List my own posts including drafts (BLG-03)' })
  listMine(@Req() req: any, @Query() query: ListPostsQueryDto) {
    return this.blogService.listMine(this.userId(req), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one published post with comments (BLG-02)' })
  getOne(@Param('id') id: string) {
    return this.blogService.getPublishedById(id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit my own post (BLG-04)' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.blogService.updatePost(this.userId(req), id, dto);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete my own post (BLG-04)' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.blogService.deletePost(this.userId(req), id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Post(':id/comments')
  @ApiOperation({ summary: 'Comment on a published post (BLG-05)' })
  addComment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.blogService.addComment(this.userId(req), id, dto);
  }
}