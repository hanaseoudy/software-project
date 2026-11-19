import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import {
  HotelReservationsPageDto,
  HotelReservationsQueryDto,
} from './dto/reservation-views.dto';
import { HotelReservationsService } from './hotel-reservations.service';

@ApiTags('Hotels')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hotels')
export class HotelReservationsController {
  constructor(private readonly reservations: HotelReservationsService) {}

  @Get(':id/reservations')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: "HTL-22: the reservations of the moderator's hotel",
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. Lists Confirmed, Completed and Cancelled reservations (guest, dates, status), latest check-in first, 10 per page. Add ?status=CONFIRMED, COMPLETED or CANCELLED to filter.',
  })
  @ApiOkResponse({ type: HotelReservationsPageDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  list(
    @Param('id') id: string,
    @Query() query: HotelReservationsQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<HotelReservationsPageDto> {
    return this.reservations.listForHotel(id, query, req.user!);
  }
}
