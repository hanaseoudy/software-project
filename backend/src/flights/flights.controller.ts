import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FlightsService } from './flights.service';
import { UserRole } from '../users/schemas/user.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFlightsDto } from './dto/create-flights.dto';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AddCabinDto } from './dto/add-cabin.dto';

@ApiTags('Flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  @ApiOperation({
    summary: 'Create a new flight (FLT-03)',
    description:
      'Allows an assigned airline moderator to create a flight with IATA airports and local date-times.',
  })
  @ApiResponse({ status: 201, description: 'Flight successfully created.' })
  @ApiResponse({
    status: 400,
    description: 'Validation error, invalid airport, or past departure time.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: User is not an assigned airline moderator.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict: Flight number already exists on this date for this airline.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @Post()
  create(
    @CurrentUser('sub') userId: AuthPayload,
    @Body() dto: CreateFlightsDto,
  ) {
    return this.flights.create(userId.sub, dto);
  }

  @Post(':id/cabins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiCookieAuth('access_token')
  @Roles(UserRole.MODERATOR)
  @ApiOperation({ summary: 'Add a cabin to an existing flight (FLT-04)' })
  @ApiParam({ name: 'id', description: 'The MongoDB ObjectId of the flight' })
  @ApiResponse({
    status: 201,
    description: 'Cabin successfully added to the flight.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request: Invalid flight ID, user ID format, or DTO validation failed (e.g., negative price).',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized: Missing or invalid authentication cookie.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden: User is not an assigned airline moderator for this flight.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found: The flight ID does not exist in the database.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict: This cabin class already exists on this flight.',
  })
  async addCabin(
    @Param('id') flightId: string,
    @Body() dto: AddCabinDto,
    @CurrentUser() user: AuthPayload,
  ) {
    // req.user.sub is the moderator's ID extracted from the JWT token
    return this.flights.addCabin(flightId, user.sub, dto);
  }
}
