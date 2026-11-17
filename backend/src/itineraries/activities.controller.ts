import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';

const errors = () =>
  applyDecorators(
    ApiResponse({
      status: 400,
      description:
        'Malformed ID, invalid fields, invalid cost/currency combination or empty PATCH. Unsupported activity fields are rejected.',
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
      description: 'Activity, day or owned itinerary unavailable',
    }),
    ApiResponse({
      status: 409,
      description: 'Concurrent update retries exhausted',
    }),
    ApiResponse({
      status: 500,
      description: 'Unexpected database failure; uncommitted writes roll back',
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
