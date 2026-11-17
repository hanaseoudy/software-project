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
import { TransportCostsService } from './transport-costs.service';
import { CreateTransportCostDto } from './dto/create-transport-cost.dto';
import { UpdateTransportCostDto } from './dto/update-transport-cost.dto';
import { TransportCostResponseDto } from './dto/transport-cost-response.dto';

const errors = () =>
  applyDecorators(
    ApiResponse({
      status: 400,
      description:
        'Invalid ID/fields, unsupported fields or empty PATCH; validation errors grouped by field',
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
      description:
        'Entry, day or owned itinerary unavailable, including a target day outside the current itinerary',
    }),
    ApiResponse({
      status: 409,
      description: 'Concurrent-update retries exhausted',
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

@ApiTags('transport-costs')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller()
export class TransportCostsController {
  constructor(private readonly costs: TransportCostsService) {}

  @Post('itineraries/:id/transport-costs')
  @ApiOperation({
    summary: 'Add an intercity transport cost (ITN-16)',
    description:
      'dayId must belong to the owned itinerary. All six fields are required. Cities use seeded cityId values and may be identical; they need not match itinerary cities. Amount may be zero. Currency uses GEN-12. No budget-entry duplication or FX conversion.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary ObjectId' })
  @ApiCreatedResponse({ type: TransportCostResponseDto })
  @errors()
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateTransportCostDto,
  ) {
    this.validateFields(req.body);
    return this.costs.create(req.user!.sub, id, dto);
  }

  @Patch('transport-costs/:id')
  @ApiOperation({
    summary: 'Edit an owned transport cost (ITN-16)',
    description:
      'Omitted fields are preserved; null and empty PATCH are rejected. dayId may change only within the same itinerary. The complete resulting entry is validated against reference data.',
  })
  @ApiParam({ name: 'id', description: 'Transport-cost ObjectId' })
  @ApiOkResponse({ type: TransportCostResponseDto })
  @errors()
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTransportCostDto,
  ) {
    this.validateFields(req.body);
    return this.costs.update(req.user!.sub, id, dto);
  }

  @Delete('transport-costs/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete only the selected owned transport cost (ITN-16)',
  })
  @ApiParam({ name: 'id', description: 'Transport-cost ObjectId' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Transport cost deleted successfully',
        },
      },
    },
  })
  @errors()
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.costs.remove(req.user!.sub, id);
  }

  private validateFields(body: unknown) {
    // Shared validation strips a transformed copy. Raw keys remain available to
    // reject unsupported fields without changing global validation conventions.
    if (!body || typeof body !== 'object') return;
    const fields = new Set([
      'dayId',
      'mode',
      'fromCityId',
      'toCityId',
      'amount',
      'currency',
    ]);
    const unknown = Object.keys(body).filter((key) => !fields.has(key));
    if (unknown.length)
      throw new BadRequestException({
        message: 'Validation failed',
        errors: Object.fromEntries(
          unknown.map((key) => [key, ['Unsupported transport-cost field']]),
        ),
      });
  }
}
