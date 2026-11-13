
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Get,
  UseGuards,
} from '@nestjs/common';

import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

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
  constructor(
    private readonly itinerariesService: ItinerariesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List my itineraries (ITN-03)',
  })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.itinerariesService.findAll(req.user!.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get my itinerary details (ITN-03)',
  })
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.itinerariesService.findOne(req.user!.sub, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create itinerary (ITN-01)' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateItineraryDto,
  ) {
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
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
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

}
