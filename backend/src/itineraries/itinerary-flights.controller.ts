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
import { ItineraryFlightsService } from './itinerary-flights.service';
import {
  ItineraryFlightSearchQueryDto,
  ItineraryTripType,
} from './dto/itinerary-flight-search-query.dto';
import { ItineraryFlightSearchResponseDto } from './dto/itinerary-flight-search-response.dto';

@ApiTags('itineraries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItineraryFlightsController {
  constructor(private readonly flights: ItineraryFlightsService) {}
  @Get(':id/flights')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Search flights to my itinerary first-day city (ITN-26)',
    description:
      'Owner only, including Public itineraries. Departure airport is a predefined IATA code. All eligible city airports participate; the origin itself is excluded. ONE_WAY by default, ROUND_TRIP returns independent outbound/return pages. Dates default to start/last day, with real-calendar overrides supported. Outbound dates are origin-local; return dates are local at each destination-city departure airport. Reuses FLT-11/12/15 availability, pricing and filters. Each leg is globally sorted, deduplicated by flight _id, then paginated at 10 rows. No bookings or holds. Empty matches yield empty pages. Legacy /flights/search remains unpaginated.',
  })
  @ApiParam({ name: 'id', description: 'Owned itinerary ObjectId' })
  @ApiOkResponse({ type: ItineraryFlightSearchResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid ID, trip type, predefined airport, calendar date, passenger/filter/page parameters or destination override',
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'Account requires temporary password change',
  })
  @ApiResponse({
    status: 404,
    description: 'Owned itinerary unavailable or no days',
  })
  @ApiResponse({
    status: 409,
    description:
      'Existing day order, city, airport mapping or itinerary dates invalid',
  })
  @ApiResponse({
    status: 503,
    description:
      'Consistent itinerary snapshot or flight identifiers unavailable',
  })
  search(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ItineraryFlightSearchQueryDto,
  ) {
    const allowed = new Set([
      'departureAirport',
      'tripType',
      'departureDate',
      'returnDate',
      'adults',
      'children',
      'infants',
      'cabinClass',
      'minPrice',
      'maxPrice',
      'sortBy',
      'sortOrder',
      'outboundPage',
      'returnPage',
    ]);
    const errors: Record<string, string[]> = {};
    for (const field of Object.keys(req.query))
      if (!allowed.has(field))
        errors[field] = ['Unsupported itinerary flight-search parameter'];
    if (
      (query.tripType ?? ItineraryTripType.ONE_WAY) ===
      ItineraryTripType.ONE_WAY
    )
      for (const field of ['returnDate', 'returnPage'])
        if (Object.hasOwn(req.query, field))
          errors[field] = ['Only supported with ROUND_TRIP'];
    if (Object.keys(errors).length)
      throw new BadRequestException({ message: 'Validation failed', errors });
    return this.flights.search(req.user!.sub, id, query);
  }
}
