import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { FavouritesQueryDto } from './dto/favourites-query.dto';
import { FavouritesService } from './favourites.service';

@ApiTags('Favourites')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('favourites')
export class FavouritesController {
  constructor(private readonly favouritesService: FavouritesService) {}

  @Get()
  @ApiOperation({
    summary: 'BON-02: view your favourites (hotels and public itineraries)',
    description:
      'Newest first, 10 per page (GEN-05). Filter with ?type=hotel or ?type=itinerary. An item that is no longer available (hotel deactivated, itinerary made private or hidden) is listed with available: false and no details, so you can remove it.',
  })
  @ApiOkResponse({
    description: 'Page of favourites',
    schema: {
      example: {
        items: [
          {
            type: 'hotel',
            id: '665f1c2e8b3c4a0012345678',
            favouritedAt: '2026-12-01T10:00:00.000Z',
            available: true,
            name: 'Nile View Hotel',
            starRating: 4,
            averageRating: 4.3,
            image: '/api/uploads/hotels/abc.jpg',
          },
          {
            type: 'itinerary',
            id: '665f1c2e8b3c4a0012345679',
            favouritedAt: '2026-11-30T09:00:00.000Z',
            available: true,
            title: 'Cairo to Luxor in 5 days',
            countryIds: ['EG'],
            startDate: '2027-02-01T00:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid page or type' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({
    description: 'Only registered users have favourites',
  })
  list(@Req() req: AuthenticatedRequest, @Query() query: FavouritesQueryDto) {
    return this.favouritesService.list(req.user!.sub, query);
  }

  @Put(':type/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'BON-02: save a hotel or a public itinerary to your favourites',
    description:
      'Adding an item that is already saved changes nothing (created: false). Only active hotels and Public, non-hidden itineraries can be saved.',
  })
  @ApiParam({ name: 'type', enum: ['hotel', 'itinerary'] })
  @ApiParam({ name: 'id', description: 'Hotel id or itinerary id' })
  @ApiOkResponse({
    description: 'Saved',
    schema: {
      example: {
        type: 'hotel',
        id: '665f1c2e8b3c4a0012345678',
        favourite: true,
        created: true,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid type or id' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({
    description: 'Only registered users have favourites',
  })
  @ApiNotFoundResponse({
    description: 'Hotel or itinerary not found or not available',
  })
  add(
    @Req() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.favouritesService.add(req.user!.sub, type, id);
  }

  @Delete(':type/:id')
  @ApiOperation({ summary: 'BON-02: remove an item from your favourites' })
  @ApiParam({ name: 'type', enum: ['hotel', 'itinerary'] })
  @ApiParam({ name: 'id', description: 'Hotel id or itinerary id' })
  @ApiOkResponse({
    description: 'Removed',
    schema: {
      example: {
        type: 'hotel',
        id: '665f1c2e8b3c4a0012345678',
        favourite: false,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid type or id' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({
    description: 'Only registered users have favourites',
  })
  @ApiNotFoundResponse({ description: 'Not in your favourites' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.favouritesService.remove(req.user!.sub, type, id);
  }
}
