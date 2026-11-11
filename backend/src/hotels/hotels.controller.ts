import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { Roles } from '../common/decorators/roles.decorator';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { HotelResponseDto } from './dto/hotel-response.dto';
import { RoomAvailabilityResponseDto } from './dto/room-availability-response.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import {
  CancellationTiersResponseDto,
  UpdateCancellationTiersDto,
} from './dto/update-cancellation-tiers.dto';
import { UpdateCheckTimesDto } from './dto/update-check-times.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import {
  PoliciesResponseDto,
  UpdatePoliciesDto,
} from './dto/update-policies.dto';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { HotelsService } from './hotels.service';

@ApiTags('Hotels')
@ApiCookieAuth(ACCESS_COOKIE) // shows the padlock in Swagger like the other protected routes
@Controller('hotels')
// JwtAuthGuard reads the login cookie and sets request.user ({ sub, role }); RolesGuard then checks the role.
@UseGuards(JwtAuthGuard, RolesGuard)
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
      'Extra route (not in the API contract): the contract only has PATCH for availability, which changes dates, and a PATCH cannot remove a whole range cleanly. DELETE removes one bookable range by its id. Hotel moderator only, and only for the hotel they are assigned to. Not allowed while the room has a confirmed reservation inside the range.',
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

  @Put(':id/policies')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary:
      'Set the hotel policies: check-in/out times and cancellation tiers (HTL-09, HTL-10)',
    description:
      'This is the endpoint named in the official API contract (PUT /api/hotels/:id/policies). Hotel moderator only, and only for the hotel they are assigned to. Send any of checkInTime, checkOutTime (HH:mm) and cancellationTiers (the full list, it replaces the old one); fields that are not sent stay unchanged. The shorter routes /check-times and /cancellation-tiers do the same for one part only.',
  })
  @ApiOkResponse({
    description: 'Policies saved; returns the current policies',
    type: PoliciesResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: {
        cancellationTiers: [
          'Tier 2: days before check-in 7 is already used by another tier',
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to this hotel',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  updatePolicies(
    @Param('id') id: string,
    @Body() dto: UpdatePoliciesDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PoliciesResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.updatePolicies(id, dto, req.user!);
  }

  @Patch(':id/rooms/:roomId/availability')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Change the dates of a bookable range of a room (HTL-05)',
    description:
      'This is the endpoint named in the official API contract (PATCH /api/hotels/:id/rooms/:roomId/availability). Hotel moderator only, and only for the hotel they are assigned to. Send the rangeId and the new startDate and/or endDate (both days included). The new dates must not overlap another bookable range, and days taken out of the range must not have a confirmed reservation. The DELETE route below removes a whole range.',
  })
  @ApiOkResponse({
    description: 'Range updated',
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
  @ApiNotFoundResponse({ description: 'Hotel, room or range not found' })
  @ApiConflictResponse({
    description:
      'The dates overlap another bookable range, or a confirmed reservation is in the removed days',
  })
  updateRoomBookableRange(
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomAvailabilityDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RoomAvailabilityResponseDto> {
    // RolesGuard guarantees req.user is set on this route.
    return this.hotelsService.updateRoomBookableRange(
      id,
      roomId,
      dto,
      req.user!,
    );
  }
}
