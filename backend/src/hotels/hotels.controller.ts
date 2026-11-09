import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { HotelResponseDto } from './dto/hotel-response.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
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
}
