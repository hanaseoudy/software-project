
import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ACCESS_COOKIE } from '../auth/auth.cookies';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BlogService } from './blog.service';

import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostResponseDto } from './dto/post-response.dto';

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  private userId(req: any): string {
    const u = req.user;
    return String(
      u?.userId ?? u?.id ?? u?._id ?? u?.sub ?? '',
    );
  }

  // BLG-01: Create a post.
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth(ACCESS_COOKIE)
  @Post()
  @ApiOperation({
    summary: 'Create a post as draft or published (BLG-01)',
    description:
      'Registered user only (JWT). Title and content are required. Up to 5 tags, max 30 characters each.',
  })
  @ApiResponse({
    status: 201,
    description: 'Post created',
    type: PostResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Login required',
  })
  create(
    @Req() req: any,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.blogService.createPost(
      this.userId(req),
      dto,
    );
  }

  // BLG-08: Update an authenticated user's own post.
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth(ACCESS_COOKIE)
  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing post, including its tags (BLG-08)',
    description:
      'Requires JWT authentication. Users can only update their own posts. Up to 5 unique tags, 1-30 characters each.',
  })
  @ApiParam({ name: 'id', description: 'Post id', example: '665f1c2e9b1e8a0012a3b4c5' })
  @ApiResponse({
    status: 200,
    description: 'Post updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g. more than 5 tags or a tag longer than 30 characters)',
  })
  @ApiResponse({
    status: 401,
    description: 'Login required',
  })
  @ApiResponse({
    status: 403,
    description: 'You cannot update another user post',
  })
  @ApiResponse({
    status: 404,
    description: 'Post not found',
  })
  updatePost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.blogService.updatePost(
      this.userId(req),
      id,
      dto,
    );
  }
}