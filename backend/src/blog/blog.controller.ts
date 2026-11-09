import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto } from './dto/post-response.dto';

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // author id comes from the authenticated user, never from the request body
  private userId(req: any): string {
    const u = req.user;
    return String(u?.userId ?? u?.id ?? u?._id ?? u?.sub ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({
    summary: 'Create a post as draft or published (BLG-01)',
    description:
      'Registered user only (JWT). Title and content are required (title max 200). Up to 5 tags, max 30 characters each. Status is "draft" (default) or "published".',
  })
  @ApiResponse({ status: 201, description: 'Post created', type: PostResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed (field-level messages)' })
  @ApiResponse({ status: 401, description: 'Login required' })
  create(
    @Req() req: any,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.blogService.createPost(this.userId(req), dto);
  }
} 