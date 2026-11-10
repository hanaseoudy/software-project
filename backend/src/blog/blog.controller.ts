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
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/pagination/pagination';

const POST_ID = { name: 'id', description: 'Post id', example: '665f1c2e9b1e8a0012a3b4c5' };

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  private userId(req: any): string {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  // TODO: add the auth guard from the accounts module here (ACC-04)
  @Post()
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Create a post as draft or published (BLG-01)' })
  @ApiResponse({ status: 201, description: 'Post created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Login required' })
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.blogService.createPost(this.userId(req), dto);
  }

  // Public, no login needed
  @Get()
  @ApiOperation({
    summary: 'Browse published posts, filter by tag (BLG-02, GEN-05)',
    description: 'Public. Newest first, 10 posts per page.',
  })
  @ApiResponse({ status: 200, description: 'One page of published posts', type: PaginatedResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid page (must be an integer >= 1)' })
  list(@Query() query: ListPostsQueryDto) {
    return this.blogService.listPublished(query);
  }

  // Must stay ABOVE @Get(':id'), otherwise "mine" is read as an id
  // TODO: add the auth guard here (ACC-04)
  @Get('mine')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'List my own posts including drafts (BLG-03, GEN-05)',
    description: '10 posts per page.',
  })
  @ApiResponse({ status: 200, description: 'One page of my posts', type: PaginatedResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid page (must be an integer >= 1)' })
  @ApiResponse({ status: 401, description: 'Login required' })
  listMine(@Req() req: any, @Query() query: ListPostsQueryDto) {
    return this.blogService.listMine(this.userId(req), query);
  }

  // GEN-05: ?page=N selects the page of comments (10 per page)
  @Get(':id')
  @ApiOperation({
    summary: 'Get one published post with paginated comments (BLG-02, GEN-05)',
    description:
      'Public. `comments` is paginated: oldest first, 10 per page, selected with ?page=N.',
  })
  @ApiParam(POST_ID)
  @ApiResponse({
    status: 200,
    description: 'The post; `comments` has items, total, page, pageSize (10) and totalPages',
  })
  @ApiResponse({ status: 400, description: 'Invalid page (must be an integer >= 1)' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  getOne(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.blogService.getPublishedById(id, query);
  }

  // TODO: add the auth guard here (ACC-04)
  @Patch(':id')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit my own post (BLG-04)' })
  @ApiParam(POST_ID)
  @ApiResponse({ status: 200, description: 'Post updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'You can only change your own posts' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.blogService.updatePost(this.userId(req), id, dto);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete my own post (BLG-04)' })
  @ApiParam(POST_ID)
  @ApiResponse({ status: 200, description: 'Post deleted' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'You can only change your own posts' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.blogService.deletePost(this.userId(req), id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Post(':id/comments')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Comment on a published post (BLG-05)' })
  @ApiParam(POST_ID)
  @ApiResponse({ status: 201, description: 'Comment created' })
  @ApiResponse({ status: 400, description: 'Text is empty or longer than 500 characters' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  addComment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.blogService.addComment(this.userId(req), id, dto);
  }

  // TODO: add the auth guard here (ACC-04)
  @Post(':id/like')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Like a post, once per user (BLG-06)' })
  @ApiParam(POST_ID)
  @ApiResponse({ status: 201, description: 'Post liked' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @ApiResponse({ status: 409, description: 'You already liked this post' })
  like(@Req() req: any, @Param('id') id: string) {
    return this.blogService.likePost(this.userId(req), id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id/like')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Remove my like from a post (BLG-06)' })
  @ApiParam(POST_ID)
  @ApiResponse({ status: 200, description: 'Like removed' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 404, description: 'Post not found, or you have not liked this post' })
  unlike(@Req() req: any, @Param('id') id: string) {
    return this.blogService.unlikePost(this.userId(req), id);
  }
}
