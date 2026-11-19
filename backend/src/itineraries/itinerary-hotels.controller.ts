import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { HotelSearchPageDto } from '../hotels/dto/hotel-search-result.dto';
import { ItineraryHotelSearchQueryDto } from './dto/itinerary-hotel-search-query.dto';
import { ItineraryHotelsService } from './itinerary-hotels.service';

@ApiTags('itineraries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItineraryHotelsController {
  constructor(private readonly hotels: ItineraryHotelsService) {}
  @Get(':id/hotels')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Search hotels for an owned itinerary city group (ITN-25)',
    description:
      'Select groupFirstDayId from the current groups response. Check-in is its first day; check-out is the calendar day after its last day, in UTC. A stale first-day selection returns 404 if it is no longer a group boundary. Uses the current group snapshot and GEN-12 city mapping; no client dates/destination accepted. Delegates availability, filters and pagination unchanged to HTL-11/12. Past check-in rejected. Read-only, no booking or inventory guarantee. PDF section 8.8 lists this path under ITN-09; mandatory ITN-25 defines the behavior.',
  })
  @ApiParam({ name: 'id', description: 'Owned itinerary ObjectId' })
  @ApiOkResponse({ type: HotelSearchPageDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid IDs/query, unsupported fields, past check-in or invalid hotel filters; errors grouped by field',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({
    status: 403,
    description: 'Account requires temporary password change',
  })
  @ApiResponse({
    status: 404,
    description:
      'Owned itinerary or current group unavailable, including empty itineraries',
  })
  @ApiResponse({
    status: 409,
    description: 'Existing day sequence, city reference or dates are invalid',
  })
  @ApiResponse({
    status: 503,
    description: 'Consistent itinerary snapshot unavailable',
  })
  search(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ItineraryHotelSearchQueryDto,
  ): Promise<HotelSearchPageDto> {
    // Global validation strips unknown DTO keys; inspect the raw query to reject
    // attempts to override the itinerary's trusted destination or date range.
    const allowed = new Set([
      'groupFirstDayId',
      'guests',
      'rooms',
      'page',
      'minPrice',
      'maxPrice',
      'minRating',
      'sortBy',
      'sortOrder',
    ]);
    const unknown = Object.keys(req.query).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new BadRequestException({
        message: 'Validation failed',
        errors: Object.fromEntries(
          unknown.map((key) => [
            key,
            ['Unsupported itinerary hotel-search parameter'],
          ]),
        ),
      });
    return this.hotels.search(req.user!.sub, id, query);
  }
}
