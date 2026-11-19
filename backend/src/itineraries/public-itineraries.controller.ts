import { BadRequestException, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ItinerariesService } from './itineraries.service';
import { PublicItineraryDetailDto, PublicItineraryPageDto } from './dto/public-itinerary-response.dto';
import { PublicItinerarySearchQueryDto } from './dto/public-itinerary-search-query.dto';

// ITN-21: query parameters accepted by the public search
const SEARCH_PARAMS = ['page', 'keyword', 'minDays', 'maxDays', 'country', 'city'];

// These two guest-readable routes never change the owner controller's JWT guard.
@ApiTags('itineraries')
@Controller('itineraries/public')
export class PublicItinerariesController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Get('search')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Search Public, nonhidden itineraries (ITN-20, ITN-21)',
    description: 'ITN-21: optional keyword (case-insensitive partial match on title, country name/code, city name/code), duration (minDays/maxDays), country code and city code filters. Paginated using GEN-05. Each request uses a timestamp-anchored snapshot following a linearizable freshness barrier. Overlapping requests may observe an earlier valid snapshot; completed responses cannot be revoked.',
  })
  @ApiOkResponse({ type: PublicItineraryPageDto })
  @ApiResponse({ status: 400, description: 'Invalid page or filter value, or unsupported query parameter' })
  @ApiResponse({ status: 503, description: 'Required consistency unavailable or request deadline exceeded; no weaker fallback' })
  search(@Req() req: Request, @Query() query: PublicItinerarySearchQueryDto) {
    this.checkQuery(req, SEARCH_PARAMS);
    const { page, keyword, minDays, maxDays, country, city } = query;
    return this.itineraries.findPublic(page ?? 1, { keyword, minDays, maxDays, country, city });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Read a Public itinerary (ITN-20)',
    description: 'Allowlisted fields only, with persisted day order and UTC dates. Private, hidden, deleted and missing itineraries return 404. A final linearizable check rejects revocation committed before that check. Data already delivered cannot be recalled; revocation after the check may overlap response delivery.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary MongoDB ObjectId' })
  @ApiOkResponse({ type: PublicItineraryDetailDto })
  @ApiResponse({ status: 400, description: 'Invalid itinerary ID or unsupported query parameter' })
  @ApiResponse({ status: 404, description: 'Public itinerary unavailable' })
  @ApiResponse({ status: 503, description: 'Required consistency unavailable or request deadline exceeded; no weaker fallback' })
  findOne(@Req() req: Request, @Param('id') id: string) {
    this.checkQuery(req, []);
    return this.itineraries.findPublicOne(id);
  }

  private checkQuery(req: Request, allowed: string[]) {
    // Express may turn a completed 200 into 304 for If-None-Match: *, even
    // with no-store. These endpoints always send a newly authorized response.
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    // Global validation strips a DTO copy; inspect raw keys to reject filters.
    const unknown = Object.keys(req.query).filter(key => !allowed.includes(key));
    if (unknown.length) throw new BadRequestException({
      message: 'Validation failed',
      errors: Object.fromEntries(unknown.map(key => [key, ['Unsupported public itinerary query parameter']])),
    });
  }
}

// ITN-21: cloning needs a logged-in user. Kept in its own controller so the
// guest-readable routes above never depend on the JWT guard.
@ApiTags('itineraries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class PublicItineraryCloneController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Post(':id/clone')
  @ApiOperation({
    summary: 'Clone a Public itinerary into my itineraries (ITN-21)',
    description: 'Registered users only. Copies all days, activities, budget entries and transport costs into a new Private itinerary owned by the caller, crediting the original author. The clone is independent of the original.',
  })
  @ApiParam({ name: 'id', description: 'Public itinerary MongoDB ObjectId' })
  @ApiCreatedResponse({ description: 'The new Private itinerary (same shape as GET /itineraries/:id, plus originalAuthorName)' })
  @ApiResponse({ status: 400, description: 'Invalid itinerary ID' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Public itinerary unavailable' })
  clone(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.itineraries.clonePublic(req.user!.sub, id);
  }
}
