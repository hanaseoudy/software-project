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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { UpdateTagsDto } from './dto/update-tags.dto';
import { LikeResponseDto } from './dto/like-response.dto';
import { ErrorResponseDto } from './dto/error-response.dto';
import { MyPostSummaryDto } from './dto/my-post-response.dto';
import type { MyPostsPage } from './dto/my-post-response.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { PublicPostDetailDto, PublicPostSummaryDto } from './dto/public-post-response.dto';
import type { PublicPostsPage } from './dto/public-post-response.dto';
import { PaginatedResponseDto, PaginationQueryDto } from '../common/pagination/pagination';

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
    summary: 'Browse published posts (BLG-02)',
    description:
      'Public, no login needed. Lists published, non-hidden posts newest first with title, author, date, ' +
      'excerpt, tags, images, like count and comment count. Optional exact tag filter. ' +
      'Paginated with a fixed page size of 10 (GEN-05); no results returns an empty page. Keyword search is BLG-09.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'tag', required: false, type: String, example: 'egypt', description: 'Tag name, 1 to 30 characters' })
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
    description: 'Invalid tag or page number',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { tag: ['Tag must be at most 30 characters'] } },
  })
  list(@Query() query: ListPostsQueryDto): Promise<PublicPostsPage> {
    return this.blogService.listPublished(query.tag, query.page ?? 1);
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
    summary: 'Edit my post\'s tags (BLG-08)',
    description:
      'The author replaces the tags of their own post: up to 5 tags, each 1 to 30 characters, ' +
      'stored trimmed, lowercase and without duplicates. Other fields are edited under BLG-04.',
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
    @Body() dto: UpdateTagsDto,
  ): Promise<PostResponseDto> {
    return this.blogService.update(this.requireUserId(req), id, dto);
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

  // The user id always comes from the authenticated token, never from the body or query
  private requireUserId(req: AuthenticatedRequest): string {
    const user = req.user as (AuthenticatedRequest['user'] & { userId?: unknown; id?: unknown; _id?: unknown }) | undefined;
    const userId = user?.userId ?? user?.id ?? user?._id ?? user?.sub;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return String(userId);
  }
}