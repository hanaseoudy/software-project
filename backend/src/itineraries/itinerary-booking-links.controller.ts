import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/pagination/pagination';
import { CreateItineraryBookingLinkDto } from './dto/create-itinerary-booking-link.dto';
import { ItineraryBookingLinkResponseDto } from './dto/itinerary-booking-link-response.dto';
import { ItineraryBookingLinksService } from './itinerary-booking-links.service';

@ApiTags('itinerary-bookings')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 400, description: 'Invalid IDs or fields' })
@ApiResponse({ status: 401, description: 'Not authenticated' })
@ApiResponse({ status: 403, description: 'Temporary password restriction' })
@ApiResponse({
  status: 404,
  description: 'Owned itinerary, booking, day or link unavailable',
})
@ApiResponse({
  status: 409,
  description:
    'Duplicate, ineligible, malformed or incompatible booking; concurrency retries exhausted',
})
@ApiResponse({
  status: 503,
  description:
    'Snapshot unavailable or commit uncertain; refresh before retrying',
})
@Controller('itineraries/:id/bookings')
export class ItineraryBookingLinksController {
  constructor(private readonly links: ItineraryBookingLinksService) {}
  @Post()
  @ApiCreatedResponse({ type: ItineraryBookingLinkResponseDto })
  @ApiOperation({
    summary: 'Link an owned confirmed/completed reservation (ITN-27)',
    description:
      'Direct one-way/round-trip flights only: one day matching outbound airport-local arrival and canonical city; full reservation plus baggage counted once. Connecting journeys are unsupported and rejected. Hotels require all occupied nights in the hotel city; equal cent allocation with remainder on earliest nights. One global association per booking. No booking/payment/refund writes.',
  })
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateItineraryBookingLinkDto,
  ) {
    const unknown = Object.keys(req.body ?? {}).filter(
      (key) => !['bookingType', 'bookingId', 'dayIds'].includes(key),
    );
    if (unknown.length)
      throw new BadRequestException('Unsupported booking-link fields');
    return this.links.create(req.user!.sub, id, dto);
  }
  @Get()
  @ApiOperation({
    summary: 'List my booking links including inactive associations (ITN-27)',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            $ref: '#/components/schemas/ItineraryBookingLinkResponseDto',
          },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        pageSize: { type: 'number', example: 10 },
        totalPages: { type: 'number' },
      },
    },
  })
  list(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    if (Object.keys(req.query).some((key) => key !== 'page'))
      throw new BadRequestException('Unsupported booking-link query');
    return this.links.list(req.user!.sub, id, query.page ?? 1);
  }
  @Delete(':linkId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove only the booking association (ITN-27)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Booking link removed successfully',
        },
      },
    },
  })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.links.remove(req.user!.sub, id, linkId);
  }
}
