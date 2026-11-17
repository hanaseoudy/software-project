import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiResponse,
  ApiParam,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/pagination/pagination';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ItinerariesService } from './itineraries.service';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';

import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
@ApiTags('itineraries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Get()
  @ApiOperation({ summary: 'List my itineraries (ITN-03)' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.itinerariesService.findAll(req.user!.sub, query.page ?? 1);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get my itinerary details (ITN-03)' })
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.itinerariesService.findOne(req.user!.sub, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create itinerary (ITN-01)' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateItineraryDto) {
    return this.itinerariesService.create(req.user!.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update itinerary (ITN-01)' })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateItineraryDto,
  ) {
    return this.itinerariesService.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete itinerary (ITN-01)' })
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.itinerariesService.remove(req.user!.sub, id);
  }

  @Post(':id/days')
  @ApiOperation({ summary: 'Add itinerary day (ITN-05)' })
  addDay(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateItineraryDayDto,
  ) {
    return this.itinerariesService.addDay(
      req.user!.sub,
      id,
      dto,
    );
  }

  @Get(':id/days')
  @ApiOperation({ summary: 'List itinerary days (ITN-05)' })
  findDays(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.itinerariesService.findDays(
      req.user!.sub,
      id,
    );
  }

  @Patch(':id/days/:dayId')
  @ApiOperation({ summary: 'Update itinerary day (ITN-05)' })
  updateDay(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateItineraryDayDto,
  ) {
    return this.itinerariesService.updateDay(
      req.user!.sub,
      id,
      dayId,
      dto,
    );
  }

  @Delete(':id/days/:dayId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete itinerary day and recalculate itinerary (ITN-07)',
    description: 'Frontend confirms deletion. Atomically deletes the day and its expenses, preserves surviving day IDs, renumbers days and derives UTC dates. Budget totals remain separated by currency; no FX conversion.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary MongoDB ObjectId' })
  @ApiParam({ name: 'dayId', description: 'Day MongoDB ObjectId belonging to this itinerary' })
  @ApiOkResponse({ description: 'Deleted; returns message, ordered days with derived dates, and budgetTotals [{ currency, total }]. Empty itineraries return empty arrays.', schema: {
    type: 'object', required: ['message', 'days', 'budgetTotals'], properties: {
      message: { type: 'string' },
      days: { type: 'array', items: { type: 'object', properties: {
        _id: { type: 'string' }, itineraryId: { type: 'string' }, dayNumber: { type: 'integer', minimum: 1, maximum: 60 },
        cityId: { type: 'string' }, notes: { type: 'string' }, date: { type: 'string', format: 'date' },
      } } },
      budgetTotals: { type: 'array', items: { type: 'object', properties: {
        currency: { type: 'string', example: 'USD' }, total: { type: 'number', example: 125.5 },
      } } },
    },
  } })
  @ApiResponse({ status: 400, description: 'Invalid itinerary or day ID' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Itinerary unavailable to this owner, or day not found in itinerary' })
  @ApiResponse({ status: 409, description: 'Concurrent update retries exhausted or surviving expenses require correction' })
  @ApiResponse({ status: 500, description: 'Database operation failed; uncommitted changes roll back' })
  @ApiResponse({ status: 503, description: 'Commit outcome uncertain; refresh itinerary before retrying' })
  removeDay(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('dayId') dayId: string) {
    return this.itinerariesService.removeDay(req.user!.sub, id, dayId);
  }

}
