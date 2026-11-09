import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { OptionalBlogAuthGuard } from './optional-blog-auth.guard';
import {
  MAX_POST_IMAGES,
  POST_IMAGE_UPLOAD_OPTIONS,
} from './post-images.service';
import type { UploadedPostImage } from './post-images.service';

const imageProperty = {
  type: 'array' as const,
  maxItems: MAX_POST_IMAGES,
  items: { type: 'string' as const, format: 'binary' },
  description:
    'JPG or PNG files, at most 5 MB each. At most 5 images per post.',
};

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @Post()
  @UseInterceptors(
    FilesInterceptor('images', MAX_POST_IMAGES, POST_IMAGE_UPLOAD_OPTIONS),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Create a draft or published post (BLG-01)',
    description:
      'Use JSON without uploads or multipart with optional images. For multipart, tags is a JSON array text field, e.g. ["rome","food"].',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'content'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1 },
        tags: {
          description:
            'Up to 5 tags of at most 30 characters. Use a JSON array text field for multipart.',
          anyOf: [
            { type: 'string', example: '["rome","food"]' },
            {
              type: 'array',
              maxItems: 5,
              items: { type: 'string', maxLength: 30 },
            },
          ],
        },
        status: {
          type: 'string',
          enum: ['draft', 'published'],
          default: 'draft',
        },
        images: imageProperty,
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Post created',
    type: PostResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid fields, image type, or image count',
  })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 413, description: 'Image exceeds 5 MB' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePostDto,
    @UploadedFiles() files: UploadedPostImage[] = [],
  ): Promise<PostResponseDto> {
    return this.blogService.createPost(req.user!.sub, dto, files);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @UseInterceptors(
    FilesInterceptor('images', MAX_POST_IMAGES, POST_IMAGE_UPLOAD_OPTIONS),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach images to your post (BLG-10, GEN-08)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['images'],
      properties: { images: imageProperty },
    },
  })
  @ApiResponse({ status: 201, type: PostResponseDto })
  addImages(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFiles() files: UploadedPostImage[] = [],
  ) {
    return this.blogService.addImages(req.user!.sub, id, files);
  }

  @Delete(':id/images/:filename')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'Remove an image from your post using the filename in its URL (BLG-10)',
  })
  @ApiResponse({ status: 200, type: PostResponseDto })
  removeImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('filename') filename: string,
  ) {
    return this.blogService.removeImage(req.user!.sub, id, filename);
  }

  @Get('images/:filename')
  @UseGuards(OptionalBlogAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Read a post image; draft and hidden images are author-only',
  })
  readImage(
    @Req() req: AuthenticatedRequest,
    @Param('filename') filename: string,
  ) {
    return this.blogService.readImage(filename, req.user?.sub);
  }
}
