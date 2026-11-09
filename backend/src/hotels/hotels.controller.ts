import {
  Body,
  Controller,
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
  JwtAuthGuard,
} from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { HotelResponseDto } from './dto/hotel-response.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import {
  CancellationTiersResponseDto,
  UpdateCancellationTiersDto,
} from './dto/update-cancellation-tiers.dto';
import { UpdateCheckTimesDto } from './dto/update-check-times.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { HotelsService } from './hotels.service';

@ApiTags('Hotels')
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
}
