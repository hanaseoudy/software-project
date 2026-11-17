import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { LikeResponseDto } from './dto/like-response.dto';
import { ErrorResponseDto } from './dto/error-response.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';
import { StrictBody } from './strict-body.decorator';
import { MyPostSummaryDto } from './dto/my-post-response.dto';
import type { MyPostsPage } from './dto/my-post-response.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { PostSearchItemDto } from './dto/post-search-response.dto';
import type { PostSearchPage } from './dto/post-search-response.dto';
import { PublicPostDetailDto, PublicPostSummaryDto } from './dto/public-post-response.dto';
import type { PublicPostsPage } from './dto/public-post-response.dto';
import { PaginatedResponseDto, PaginationQueryDto } from '../common/pagination/pagination';
import { AttachedImageResponseDto, RemovedImageResponseDto } from './dto/post-image-response.dto';
import { imageUploadOptions } from '../uploads/image-upload.options';
import { ImageCategory } from '../uploads/uploads.constants';
import type { UploadedImage } from '../uploads/uploads.service';

@ApiTags('blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a blog post as draft or published (BLG-01)' })
  @ApiCreatedResponse({ description: 'Post created', type: PostResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: {
        title: ['Title is required'],
        tags: ['A post can have at most 5 tags'],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePostDto): Promise<PostResponseDto> {
    return this.blogService.create(req.user!.sub, dto);
  }

  // Declared before any GET /posts/:id route so "mine" is not treated as an id
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'List my own posts, including drafts (BLG-03)',
    description:
      'Returns the logged-in user\'s posts (draft and published) with title, status, creation date, ' +
      'like count and comment count, newest first. Paginated with a fixed page size of 10 (GEN-05).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiExtraModels(PaginatedResponseDto, MyPostSummaryDto)
  @ApiOkResponse({
    description: 'One page of the user\'s posts',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResponseDto) },
        { properties: { items: { type: 'array', items: { $ref: getSchemaPath(MyPostSummaryDto) } } } },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid page number',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { page: ['Page must be at least 1'] } },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  listMine(@Req() req: AuthenticatedRequest, @Query() query: PaginationQueryDto): Promise<MyPostsPage> {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return this.blogService.listMine(userId, query.page ?? 1);
  }

  @Get()
  @ApiOperation({
    summary: 'Browse and search published posts (BLG-02, BLG-09)',
    description:
      'Public, no login needed. Lists published, non-hidden posts newest first with title, author, date, ' +
      'excerpt, tags, images, like count and comment count. Optional exact tag filter. ' +
      'With "search" (BLG-09), matches the keyword (case-insensitive, partial) in the title, the tags or the author name, ' +
      'ordered by interaction score (likes + comments) descending, newest first as tie-breaker. ' +
      'Paginated with a fixed page size of 10 (GEN-05); no results returns an empty page.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'tag', required: false, type: String, example: 'egypt', description: 'Tag name, 1 to 30 characters' })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'luxor', description: 'Keyword, 1 to 100 characters' })
  @ApiExtraModels(PaginatedResponseDto, PublicPostSummaryDto)
  @ApiOkResponse({
    description: 'One page of published posts',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResponseDto) },
        { properties: { items: { type: 'array', items: { $ref: getSchemaPath(PublicPostSummaryDto) } } } },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid tag, search keyword or page number',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { tag: ['Tag must be at most 30 characters'] } },
  })
  list(@Query() query: ListPostsQueryDto): Promise<PublicPostsPage> {
    return this.blogService.listPublished(query.tag, query.page ?? 1, query.search);
  }

  // Declared after GET /posts/mine so "mine" is not treated as an id
  @Get(':id')
  @ApiOperation({
    summary: 'Open a published post (BLG-02)',
    description:
      'Public, no login needed. Shows title, author, date, body, tags, images, like count and the visible ' +
      'comments oldest first. Drafts, hidden posts and posts of deactivated authors return 404.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiOkResponse({ description: 'The post page', type: PublicPostDetailDto })
  @ApiNotFoundResponse({
    description: 'Invalid post id, or the post does not exist, is a draft or is hidden',
    type: ErrorResponseDto,
  })
  findOne(@Param('id') id: string): Promise<PublicPostDetailDto> {
    return this.blogService.getPublished(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Edit my post (BLG-04, BLG-08)',
    description:
      'The author can update title, content, status and tags. Omitted fields remain unchanged.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiOkResponse({ description: 'Post updated', type: PostResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { tags: ['A post can have at most 5 tags'] } },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in', type: ErrorResponseDto })
  @ApiForbiddenResponse({ description: 'The post belongs to another user', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Invalid post id or the post does not exist', type: ErrorResponseDto })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    return this.blogService.update(this.requireUserId(req), id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Delete my post and its comments and likes (BLG-04)' })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)' })
  @ApiResponse({ status: 204, description: 'Post deleted' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'The post belongs to another user' })
  @ApiNotFoundResponse({ description: 'Invalid post id or post not found' })
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.blogService.deletePost(this.requireUserId(req), id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Like a post (BLG-06)',
    description:
      'Adds a like from the logged-in user to a published, visible post and returns the updated like count. ' +
      'A user can like a post only once; a second like returns 409.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiResponse({ status: 201, description: 'Post liked', type: LikeResponseDto })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Invalid post id, or the post does not exist, is a draft or is hidden',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 409, description: 'You have already liked this post', type: ErrorResponseDto })
  like(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<LikeResponseDto> {
    return this.blogService.likePost(this.requireUserId(req), id);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Remove my like from a post (BLG-06)',
    description:
      'Removes the logged-in user\'s like from a published, visible post and returns the updated like count. ' +
      'Returns 404 if the user has not liked the post.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiResponse({ status: 200, description: 'Like removed', type: LikeResponseDto })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Invalid post id, the post does not exist, is a draft or is hidden, or you have not liked it',
    type: ErrorResponseDto,
  })
  unlike(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<LikeResponseDto> {
    return this.blogService.unlikePost(this.requireUserId(req), id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Comment on a post (BLG-05)',
    description:
      'Login required. Adds a comment from the logged-in user to a published, visible post. ' +
      'The text is trimmed and must be 1 to 500 characters; unknown fields are rejected. ' +
      'Comments are stored for chronological display, oldest first.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiBody({ type: CreateCommentDto })
  @ApiResponse({ status: 201, description: 'Comment added', type: CommentResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { text: ['Comment must be at most 500 characters'] } },
  })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Invalid post id, or the post does not exist, is a draft or is hidden',
    type: ErrorResponseDto,
  })
  addComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @StrictBody() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    return this.blogService.addComment(this.requireUserId(req), id, dto.text);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', imageUploadOptions(ImageCategory.POST)))
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Attach an image to my post (BLG-10, GEN-08)',
    description:
      'Author only. Uploads one image in the multipart field "image" and attaches it to the logged-in ' +
      'user\'s own post, whether draft or published. The image must be JPG or PNG, up to 5 MB; a post can ' +
      'have at most 5 images. The file is stored on the server and served from the returned URL.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary', description: 'JPG or PNG image, up to 5 MB' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Image attached', type: AttachedImageResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'No image was provided, the file is not a valid JPG or PNG image, or the post already has 5 images',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'The post belongs to another user', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Invalid post id or the post does not exist', type: ErrorResponseDto })
  @ApiResponse({ status: 413, description: 'The image is larger than 5 MB', type: ErrorResponseDto })
  addImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<AttachedImageResponseDto> {
    return this.blogService.addImage(this.requireUserId(req), id, file);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Remove an image from my post (BLG-10)',
    description:
      'Author only. Removes the image from the logged-in user\'s own post and deletes the stored file. ' +
      'Returns the post\'s remaining images.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiParam({ name: 'imageId', description: 'Image id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60718' })
  @ApiResponse({ status: 200, description: 'Image removed', type: RemovedImageResponseDto })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'The post belongs to another user', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Invalid post or image id, the post does not exist, or the image is not on this post',
    type: ErrorResponseDto,
  })
  removeImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<RemovedImageResponseDto> {
    return this.blogService.removeImage(this.requireUserId(req), id, imageId);
  }

  // The user id always comes from the authenticated token, never from the body or query
  private requireUserId(req: AuthenticatedRequest): string {
    const user = req.user as (AuthenticatedRequest['user'] & { userId?: unknown; id?: unknown; _id?: unknown }) | undefined;
    const userId = user?.userId ?? user?.id ?? user?._id ?? user?.sub;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return String(userId);
  }
}