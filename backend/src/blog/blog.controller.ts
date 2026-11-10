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
  @ApiOperation({
    summary: 'Create a post as draft or published (BLG-01)',
    description:
      'Registered user only. Title and content are required (title max 200). Up to 5 tags, max 30 characters each (BLG-08). Status is "draft" (default) or "published".',
  })
  @ApiResponse({ status: 201, description: 'Post created' })
  @ApiResponse({ status: 400, description: 'Validation failed (field-level messages)' })
  @ApiResponse({ status: 401, description: 'Login required' })
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.blogService.createPost(this.userId(req), dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Browse published posts, filter by tag (BLG-02)',
    description:
      'Public, no login needed. Only published and visible posts, newest first. Page size is fixed at 10 (GEN-05). Optional ?tag=rome filter and ?page=2.',
  })
  @ApiResponse({
    status: 200,
    description: 'Page of posts: { items, total, page, pageSize, totalPages }',
  })
  @ApiResponse({ status: 400, description: 'Invalid page (must be an integer >= 1)' })
  list(@Query() query: ListPostsQueryDto) {
    return this.blogService.listPublished(query);
  }

  // Must stay ABOVE @Get(':id'), otherwise "mine" is read as an id
  // TODO: add the auth guard here (ACC-04)
  @Get('mine')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'List my own posts including drafts (BLG-03)',
    description:
      'Registered user only. Returns the logged-in user\'s posts (drafts and published) with title, status, date, likesCount and commentsCount. Page size 10.',
  })
  @ApiResponse({ status: 200, description: 'Page of my posts' })
  @ApiResponse({ status: 400, description: 'Invalid page (must be an integer >= 1)' })
  @ApiResponse({ status: 401, description: 'Login required' })
  listMine(@Req() req: any, @Query() query: ListPostsQueryDto) {
    return this.blogService.listMine(this.userId(req), query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one published post with comments (BLG-02)',
    description:
      'Public. Returns title, author, date, content, tags, images, likesCount and the comments (oldest first, BLG-05).',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)' })
  @ApiResponse({ status: 200, description: 'Post with comments' })
  @ApiResponse({ status: 404, description: 'Post not found, not published or hidden' })
  getOne(@Param('id') id: string) {
    return this.blogService.getPublishedById(id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Patch(':id')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Edit my own post (BLG-04)',
    description:
      'Author only. Any field from the create body can be sent, including tags (BLG-08) and status (draft/published).',
  })
  @ApiParam({ name: 'id', description: 'Post id' })
  @ApiResponse({ status: 200, description: 'Updated post' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'Not your post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.blogService.updatePost(this.userId(req), id, dto);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Delete my own post (BLG-04)',
    description:
      'Author only. Also deletes the post\'s comments and likes.',
  })
  @ApiParam({ name: 'id', description: 'Post id' })
  @ApiResponse({ status: 200, description: 'Post deleted' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'Not your post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.blogService.deletePost(this.userId(req), id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Post(':id/comments')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Comment on a published post (BLG-05)',
    description:
      'Registered user only. Text is required, trimmed, max 500 characters. Increases commentsCount on the post.',
  })
  @ApiParam({ name: 'id', description: 'Post id' })
  @ApiResponse({ status: 201, description: 'Comment created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 404, description: 'Post not found or not published' })
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
  @ApiOperation({
    summary: 'Like a post, once per user (BLG-06)',
    description:
      'Registered user only. A second like by the same user returns 409. Returns the new likesCount.',
  })
  @ApiParam({ name: 'id', description: 'Post id' })
  @ApiResponse({ status: 201, description: '{ liked: true, likesCount }' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @ApiResponse({ status: 409, description: 'Already liked' })
  like(@Req() req: any, @Param('id') id: string) {
    return this.blogService.likePost(this.userId(req), id);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id/like')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Remove my like from a post (BLG-06)',
    description: 'Registered user only. Returns the new likesCount.',
  })
  @ApiParam({ name: 'id', description: 'Post id' })
  @ApiResponse({ status: 200, description: '{ liked: false, likesCount }' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 404, description: 'Post not found or not liked' })
  unlike(@Req() req: any, @Param('id') id: string) {
    return this.blogService.unlikePost(this.userId(req), id);
  }
}
