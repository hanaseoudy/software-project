import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import {
  type AuthenticatedRequest,
  RolesGuard,
} from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto';
import { HotelDetailsResponseDto } from './dto/hotel-details-response.dto';
import { HotelResponseDto } from './dto/hotel-response.dto';
import { RoomAvailabilityResponseDto } from './dto/room-availability-response.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import {
  CancellationTiersResponseDto,
  UpdateCancellationTiersDto,
} from './dto/update-cancellation-tiers.dto';
import { UpdateCheckTimesDto } from './dto/update-check-times.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { HotelsService } from './hotels.service';

@ApiTags('Hotels')
@Controller('hotels')
@UseGuards(RolesGuard)
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a hotel profile (HTL-01)',
    description: 'Admin only.',
  })
  @ApiCreatedResponse({ description: 'Hotel created', type: HotelResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { name: ['Name is required'], city: ['City does not exist'] },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  create(@Body() dto: CreateHotelDto): Promise<HotelResponseDto> {
    return this.hotelsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Edit the hotel profile (HTL-01)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to.',
  })
  @ApiOkResponse({ description: 'Hotel updated', type: HotelResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHotelDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<HotelResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.update(id, dto, req.user!);
  }

  @Put(':id/check-times')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Set the check-in and check-out times (HTL-09)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. Times use the 24-hour HH:mm format.',
  })
  @ApiOkResponse({
    description: 'Times saved; returns the hotel',
    type: HotelResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: {
        checkInTime: ['Check-in time must be in HH:mm format (00:00 to 23:59)'],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  updateCheckTimes(
    @Param('id') id: string,
    @Body() dto: UpdateCheckTimesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<HotelResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.updateCheckTimes(id, dto, req.user!);
  }

  @Put(':id/cancellation-tiers')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Set the cancellation tiers (HTL-10)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. Replaces the whole list. Each tier has a unique days-before-check-in value (whole number, 0 or more) and a refund percentage from 0 to 100.',
  })
  @ApiOkResponse({
    description: 'Tiers saved; returns the new list',
    type: CancellationTiersResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: {
        tiers: [
          'Tier 2: days before check-in 7 is already used by another tier',
          'Tier 3: refund percentage must be between 0 and 100',
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  setCancellationTiers(
    @Param('id') id: string,
    @Body() dto: UpdateCancellationTiersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CancellationTiersResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.setCancellationTiers(id, dto, req.user!);
  }

  @Post(':id/rooms')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Add a room to the hotel (HTL-03)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. The room number must be unique within the hotel (saved in capital letters).',
  })
  @ApiCreatedResponse({ description: 'Room created', type: RoomResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: {
        beds: ['Beds must be at least 1'],
        pricePerNight: ['Price per night must be more than 0'],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  @ApiConflictResponse({
    description: 'A room with this number already exists in the hotel',
  })
  createRoom(
    @Param('id') id: string,
    @Body() dto: CreateRoomDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RoomResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.createRoom(id, dto, req.user!);
  }

  @Post(':id/rooms/:roomId/availability')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Add a bookable date range to a room (HTL-04)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. Both days are included. A range must not overlap another bookable range of the same room.',
  })
  @ApiCreatedResponse({
    description: 'Bookable range created',
    type: RoomAvailabilityResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { endDate: ['End date must be on or after the start date'] },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel or room not found' })
  @ApiConflictResponse({
    description: 'The dates overlap an existing bookable range of this room',
  })
  addRoomBookableRange(
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateRoomAvailabilityDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RoomAvailabilityResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.addRoomBookableRange(id, roomId, dto, req.user!);
  }

  @Patch(':id/rooms/:roomId')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Edit a room: beds, occupancy or price (HTL-05)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. Send at least one field. A new price applies to future bookings only; existing reservations keep the price they were made with.',
  })
  @ApiOkResponse({ description: 'Room updated', type: RoomResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { pricePerNight: ['Price per night must be more than 0'] },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel or room not found' })
  updateRoom(
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RoomResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.updateRoom(id, roomId, dto, req.user!);
  }

  @Delete(':id/rooms/:roomId/availability/:rangeId')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Remove a bookable date range from a room (HTL-05)',
    description:
      'Hotel moderator only, and only for the hotel they are assigned to. Not allowed while the room has a confirmed reservation inside the range.',
  })
  @ApiOkResponse({
    description: 'The range that was removed',
    type: RoomAvailabilityResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel, room or range not found' })
  @ApiConflictResponse({
    description: 'A confirmed reservation exists in the range',
  })
  removeRoomBookableRange(
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Param('rangeId') rangeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RoomAvailabilityResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.removeRoomBookableRange(
      id,
      roomId,
      rangeId,
      req.user!,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Hotel details page (HTL-02)',
    description:
      'Public: no login needed. Shows the profile, photos, amenities, check-in/check-out times, cancellation policy, average rating and recent reviews. Send checkIn and checkOut (YYYY-MM-DD) together to also get the rooms that are free for the whole stay.',
  })
  @ApiOkResponse({
    description: 'Hotel details',
    type: HotelDetailsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid stay dates; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { checkOut: ['Check-out must be after the check-in day'] },
    },
  })
  @ApiNotFoundResponse({ description: 'Hotel not found or not active' })
  getDetails(
    @Param('id') id: string,
    @Query() query: HotelDetailsQueryDto,
  ): Promise<HotelDetailsResponseDto> {
    return this.hotelsService.getDetails(id, query);
  }
}
