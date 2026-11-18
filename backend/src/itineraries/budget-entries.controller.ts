import {
  applyDecorators,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
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
import { BudgetEntriesService } from './budget-entries.service';
import { CreateBudgetEntryDto } from './dto/create-budget-entry.dto';
import { UpdateBudgetEntryDto } from './dto/update-budget-entry.dto';
import { BudgetEntryResponseDto } from './dto/budget-entry-response.dto';
import { ItineraryBudgetTotalsResponseDto } from './dto/itinerary-budget-totals-response.dto';
const errors = () =>
  applyDecorators(
    ApiResponse({
      status: 400,
      description:
        'Invalid IDs/fields, unsupported currency/category, negative or nonfinite amount, unsupported fields or empty PATCH',
    }),
    ApiResponse({
      status: 401,
      description: 'Missing or invalid authentication',
    }),
    ApiResponse({
      status: 403,
      description: 'Account requires temporary password change',
    }),
    ApiResponse({
      status: 404,
      description: 'Owned itinerary, associated day or entry unavailable',
    }),
    ApiResponse({
      status: 409,
      description:
        'Concurrency retries exhausted or existing expenses cannot be represented safely',
    }),
    ApiResponse({
      status: 503,
      description:
        'Consistent snapshot unavailable or commit outcome uncertain; refresh before retrying',
    }),
    ApiResponse({
      status: 500,
      description: 'Unexpected database failure; uncommitted writes roll back',
    }),
  );
@ApiTags('budget-entries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller()
export class BudgetEntriesController {
  constructor(private readonly budgets: BudgetEntriesService) {}
  @Post('itineraries/:id/days/:dayId/budget-entries')
  @ApiOperation({
    summary: 'Create an owned daily budget entry (ITN-14)',
    description:
      'Category, amount and currency required. Description optional. Amount may be zero. No activity or transport mirror records are created.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary ObjectId' })
  @ApiParam({
    name: 'dayId',
    description: 'Day ObjectId in the owned itinerary',
  })
  @ApiCreatedResponse({ type: BudgetEntryResponseDto })
  @errors()
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateBudgetEntryDto,
  ) {
    this.validateFields(req.body);
    return this.budgets.create(req.user!.sub, id, dayId, dto);
  }
  @Get('itineraries/:id/days/:dayId/budget-entries')
  @ApiOperation({
    summary: 'List owned day budget entries (ITN-14)',
    description: 'Ordered by entry ID. Empty array when no entries exist.',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'dayId' })
  @ApiOkResponse({ type: BudgetEntryResponseDto, isArray: true })
  @errors()
  list(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
  ) {
    return this.budgets.list(req.user!.sub, id, dayId);
  }
  @Patch('budget-entries/:id')
  @ApiOperation({
    summary: 'Edit an owned budget entry (ITN-14)',
    description:
      'Provide at least one editable field. Omitted fields preserved; null rejected. Day cannot change.',
  })
  @ApiParam({ name: 'id', description: 'Budget entry ObjectId' })
  @ApiOkResponse({ type: BudgetEntryResponseDto })
  @errors()
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetEntryDto,
  ) {
    this.validateFields(req.body);
    return this.budgets.update(req.user!.sub, id, dto);
  }
  @Delete('budget-entries/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an owned budget entry (ITN-14)' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Budget entry deleted successfully',
        },
      },
    },
  })
  @errors()
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgets.remove(req.user!.sub, id);
  }
  @Get('itineraries/:id/budget-totals')
  @ApiOperation({
    summary:
      'Get owned itinerary totals by currency, day and category (ITN-14)',
    description:
      'One primary snapshot. Budget entries, costed activities and intercity transport count once each. Activity costs use ACTIVITIES; INTERCITY_TRANSPORT is response-only. No FX or purchase-level deduplication. Exact integer minor-unit reconciliation; invalid legacy sub-cent/unsafe totals return 409. Empty days have totals: [].',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: ItineraryBudgetTotalsResponseDto })
  @errors()
  totals(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgets.totals(req.user!.sub, id);
  }
  private validateFields(body: unknown) {
    if (!body || typeof body !== 'object') return;
    const allowed = new Set(['category', 'amount', 'currency', 'description']);
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new BadRequestException({
        message: 'Validation failed',
        errors: Object.fromEntries(
          unknown.map((key) => [key, ['Unsupported budget-entry field']]),
        ),
      });
  }
}
