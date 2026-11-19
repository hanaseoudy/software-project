import { BadRequestException, Controller, Get, Header, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaginationQueryDto } from '../common/pagination/pagination';
import { ItinerariesService } from './itineraries.service';
import { PublicItineraryDetailDto, PublicItineraryPageDto } from './dto/public-itinerary-response.dto';

// These two guest-readable routes never change the owner controller's JWT guard.
@ApiTags('itineraries')
@Controller('itineraries/public')
export class PublicItinerariesController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Get('search')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Discover Public, nonhidden itineraries (ITN-20)',
    description: 'Pagination only, using GEN-05. Keyword/filter search belongs to ITN-21. Each request uses a timestamp-anchored snapshot following a linearizable freshness barrier. Overlapping requests may observe an earlier valid snapshot; completed responses cannot be revoked.',
  })
  @ApiOkResponse({ type: PublicItineraryPageDto })
  @ApiResponse({ status: 400, description: 'Invalid page or unsupported query parameter' })
  @ApiResponse({ status: 503, description: 'Required consistency unavailable or request deadline exceeded; no weaker fallback' })
  search(@Req() req: Request, @Query() query: PaginationQueryDto) {
    this.checkQuery(req, ['page']);
    return this.itineraries.findPublic(query.page ?? 1);
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
