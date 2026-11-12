import { Body, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
import { MyPostSummaryDto } from './dto/my-post-response.dto';
import type { MyPostsPage } from './dto/my-post-response.dto';
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
}