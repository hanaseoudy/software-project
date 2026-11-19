import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';
import {
  AttachedActivityImageDto,
  RemoveActivityImageQueryDto,
} from './dto/activity-image.dto';
import { imageUploadOptions } from '../uploads/image-upload.options';
import {
  ImageCategory,
  MAX_IMAGE_SIZE_BYTES,
} from '../uploads/uploads.constants';
import type { UploadedImage } from '../uploads/uploads.service';

const activityImageOptions = imageUploadOptions(ImageCategory.ACTIVITY);

const errors = (
  invalidInput = 'Malformed ID, invalid fields, invalid cost/currency combination or empty PATCH. Unsupported activity fields are rejected.',
  notFound = 'Activity, day or owned itinerary unavailable',
) =>
  applyDecorators(
    ApiResponse({
      status: 400,
      description: invalidInput,
    }),
    ApiResponse({
      status: 401,
      description: 'Missing or invalid authentication',
    }),
    ApiResponse({
      status: 403,
      description:
        'Account must change its temporary password before proceeding',
    }),
    ApiResponse({
      status: 404,
      description: notFound,
    }),
    ApiResponse({
      status: 409,
      description: 'Concurrent update retries exhausted',
    }),
    ApiResponse({
      status: 500,
      description: 'Unexpected database or storage failure',
    }),
    ApiResponse({
      status: 503,
      description: 'Commit outcome uncertain; refresh before retrying',
    }),
  );

@ApiTags('activities')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller()
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('activities/:id')
  @ApiOperation({
    summary: 'Read an owned activity and its image URLs (ITN-12)',
  })
  @ApiParam({ name: 'id', description: 'Activity ObjectId' })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiResponse({ status: 400, description: 'Malformed activity ID' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({
    status: 403,
    description: 'Temporary password change required',
  })
  @ApiResponse({
    status: 404,
    description: 'Activity or owned itinerary unavailable',
  })
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.activities.findOne(req.user!.sub, id);
  }

  @Post('activities/:id/images')
  @UseInterceptors(
    FileInterceptor('image', {
      ...activityImageOptions,
      // Multer rejects at its byte limit; GEN-08 accepts exactly 5 MB.
      limits: {
        ...activityImageOptions.limits,
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      },
    }),
  )
  @ApiOperation({
    summary: 'Attach an image to an owned activity (ITN-12, GEN-08)',
    description:
      'Upload one JPG or PNG up to 5 MB. An activity can have at most five images.',
  })
  @ApiParam({ name: 'id', description: 'Activity ObjectId' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: AttachedActivityImageDto })
  @errors('Malformed ID, missing or invalid image, or five-image limit reached')
  @ApiResponse({ status: 413, description: 'Image exceeds 5 MB' })
  addImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() image: UploadedImage | undefined,
  ) {
    if (image && image.size > MAX_IMAGE_SIZE_BYTES)
      throw new PayloadTooLargeException('Image exceeds 5 MB');
    return this.activities.addImage(req.user!.sub, id, image);
  }

  @Delete('activities/:id/images')
  @ApiOperation({
    summary: 'Remove an image by its stored URL (ITN-12)',
    description: 'Provide the exact URL from the activity images array.',
  })
  @ApiParam({ name: 'id', description: 'Activity ObjectId' })
  @ApiQuery({
    name: 'url',
    required: true,
    type: String,
    example: '/api/uploads/activity/680329ed-1150-49a5-b035-b0b7ef86424f.png',
  })
  @ApiOkResponse({ type: ActivityResponseDto })
  @errors(
    'Malformed ID or invalid URL parameter',
    'Activity, owned itinerary or image attachment unavailable',
  )
  removeImage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: RemoveActivityImageQueryDto,
  ) {
    return this.activities.removeImage(req.user!.sub, id, query.url);
  }

  @Delete('activities/:id/images/:imageId')
  @ApiOperation({
    summary: 'Remove an image by its GEN-08 filename (ITN-12)',
    description: 'Use the filename from an attached GEN-08 activity URL.',
  })
  @ApiParam({ name: 'id', description: 'Activity ObjectId' })
  @ApiParam({
    name: 'imageId',
    description:
      'Stored GEN-08 activity image filename, including its extension',
    example: '680329ed-1150-49a5-b035-b0b7ef86424f.png',
  })
  @ApiOkResponse({ type: ActivityResponseDto })
  @errors(
    'Malformed activity ID, invalid image filename, or ambiguous filename match',
    'Activity, owned itinerary or image attachment unavailable',
  )
  removeImageByFilename(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.activities.removeImageByFilename(req.user!.sub, id, imageId);
  }

  @Post('itineraries/:id/days/:dayId/activities')
  @ApiOperation({
    summary: 'Add an activity to an owned itinerary day (ITN-10)',
    description:
      'Optional time and cost may be null to leave them unset. Cost requires a supported currency, including when zero. Images are managed separately under ITN-12.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary ObjectId' })
  @ApiParam({ name: 'dayId', description: 'Day ObjectId in that itinerary' })
  @ApiCreatedResponse({ type: ActivityResponseDto })
  @errors()
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateActivityDto,
  ) {
    this.validateFields(req.body);
    return this.activities.create(req.user!.sub, id, dayId, dto);
  }

  @Patch('activities/:id')
  @ApiOperation({
    summary: 'Edit an owned activity (ITN-10)',
    description:
      'Omitted fields are preserved. Null clears time or cost; clearing cost also removes currency. Currency alone may change when a cost exists. Empty PATCH is rejected. Name, description and currency cannot be null.',
  })
  @ApiParam({ name: 'id', description: 'Activity ObjectId' })
  @ApiOkResponse({ type: ActivityResponseDto })
  @errors()
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    this.validateFields(req.body);
    return this.activities.update(req.user!.sub, id, dto);
  }

  @Delete('activities/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an owned activity (ITN-10)' })
  @ApiParam({ name: 'id', description: 'Activity ObjectId' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Activity deleted successfully' },
      },
    },
  })
  @errors()
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.activities.remove(req.user!.sub, id);
  }
  private validateFields(body: unknown) {
    // The global pipe validates a transformed copy; inspect the raw keys here
    // so its whitelist cannot silently hide an attempted dayId/images update.
    if (!body || typeof body !== 'object') return;
    const allowed = new Set([
      'name',
      'description',
      'time',
      'cost',
      'currency',
    ]);
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new BadRequestException({
        message: 'Validation failed',
        errors: Object.fromEntries(
          unknown.map((key) => [key, ['Unsupported activity field']]),
        ),
      });
  }
}
