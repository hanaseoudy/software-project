import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FlightsService } from './flights.service';
import { UserRole } from '../users/schemas/user.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFlightsDto } from './dto/create-flights.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  @ApiOperation({
    summary: 'Create a new flight (Airline Moderator only)',
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
}
