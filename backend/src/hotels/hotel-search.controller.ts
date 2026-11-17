import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { HotelSearchPageDto } from './dto/hotel-search-result.dto';
import { SearchHotelsQueryDto } from './dto/search-hotels-query.dto';
import { HotelSearchService } from './hotel-search.service';

// Public routes: guests can search without logging in. This controller is listed before
// HotelsController in HotelsModule so "/hotels/search" is never read as "/hotels/:id".
@ApiTags('Hotels')
@Controller('hotels')
export class HotelSearchController {
  constructor(private readonly searchService: HotelSearchService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search hotels by destination, dates and occupancy (HTL-11)',
    description:
      'Open to guests and registered users. Send a city or a country, check-in, check-out, guests and rooms (default 1). Lists active hotels with at least that many rooms free for the whole stay whose combined maximum occupancy covers the guests. Check-out must be after check-in and check-in cannot be in the past. Results are paginated, 10 per page, sorted by hotel name.',
  })
  @ApiOkResponse({
    description: 'One page of matching hotels (empty when nothing matches)',
    type: HotelSearchPageDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { checkOut: ['Check-out must be after check-in'] },
    },
  })
  search(@Query() query: SearchHotelsQueryDto): Promise<HotelSearchPageDto> {
    return this.searchService.search(query);
  }
}
