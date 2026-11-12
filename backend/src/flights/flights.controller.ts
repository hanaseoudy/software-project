import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FlightsService } from './flights.service';
import { UserRole } from '../users/schemas/user.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFlightsDto } from './dto/create-flights.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  @Roles(UserRole.MODERATOR)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFlightsDto) {
    return this.flights.create(userId, dto);
  }
}
