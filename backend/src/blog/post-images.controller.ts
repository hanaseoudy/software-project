import {
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { imageUploadOptions } from '../uploads/image-upload.options';
import { ImageCategory, MAX_IMAGES } from '../uploads/uploads.constants';
import type { UploadedImage } from '../uploads/uploads.service';
import { PostResponseDto } from './dto/post-response.dto';
import { PostImagesService } from './post-images.service';

const POST_ID = { name: 'id', description: 'Post id', example: '6650f1c2a1b2c3d4e5f60711' };

// BLG-10: attach images to / remove images from my own post (GEN-08 upload rules)
@ApiTags('blog')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostImagesController {
  constructor(private readonly postImagesService: PostImagesService) {}

  @Post(':id/images')
  @UseInterceptors(
    FilesInterceptor('images', MAX_IMAGES[ImageCategory.POST], imageUploadOptions(ImageCategory.POST)),
  )
  @ApiOperation({
    summary: 'Attach images to my post (BLG-10)',
    description:
      'Author only. Multipart field "images" (one or more files). GEN-08 rules: JPG or PNG only, ' +
      'max 5 MB each, max 25 megapixels, at most 5 images per post including the ones already attached.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam(POST_ID)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['images'],
      properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOkResponse({ description: 'Images attached; returns the updated post', type: PostResponseDto })
  @ApiBadRequestResponse({
    description:
      'No image, not a JPG/PNG, corrupted image, more than 25 megapixels, or more than 5 images on the post',
  })
  @ApiPayloadTooLargeResponse({ description: 'An image is larger than 5 MB (GEN-08)' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not my post' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  attach(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFiles() files: UploadedImage[],
  ): Promise<PostResponseDto> {
    return this.postImagesService.attach(req.user!.sub, id, files);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({
    summary: 'Remove an image from my post (BLG-10)',
    description: 'Author only. Removes the image from the post and deletes the stored file.',
  })
  @ApiParam(POST_ID)
  @ApiParam({ name: 'imageId', description: 'Image id (images[].id)', example: '6650f1c2a1b2c3d4e5f60718' })
  @ApiOkResponse({ description: 'Image removed; returns the updated post', type: PostResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not my post' })
  @ApiNotFoundResponse({ description: 'Post or image not found' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<PostResponseDto> {
    return this.postImagesService.remove(req.user!.sub, id, imageId);
  }
}
