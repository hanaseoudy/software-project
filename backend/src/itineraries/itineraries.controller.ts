
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
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

@ApiTags('itineraries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItinerariesController {
  constructor(
    private readonly itinerariesService: ItinerariesService,
  ) {}

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
}
