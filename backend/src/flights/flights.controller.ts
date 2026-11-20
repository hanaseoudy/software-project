
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { FlightsService } from './flights.service';
import { UserRole } from '../users/schemas/user.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFlightsDto } from './dto/create-flights.dto';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
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
import { UpdateFlightDto } from './dto/update-flights.dto';
import { UpdateCabinDto } from './dto/update-cabin.dto';
import { SearchFlightsDto } from './dto/search-flights.dto';
import { CancelFlightDto } from './dto/cancel-flight.dto';
 
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
 
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Cancel a Scheduled flight after confirmation (FLT-06)',
    description:
      'Cancels a Scheduled flight owned by the moderator, issues 100% refunds (PAY-03) for Confirmed bookings, releases pending seat holds, and notifies passengers.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the flight' })
  @ApiResponse({
    status: 200,
    description: 'Flight cancelled, bookings refunded, and holds released.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid flight ID, missing confirmation, or flight already departed.',
  })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: 'Not a moderator of this flight’s airline',
  })
  @ApiResponse({ status: 404, description: 'Flight not found' })
  @ApiResponse({
    status: 409,
    description:
      'Flight is not in Scheduled status (already Cancelled or Departed)',
  })
  cancelFlight(
    @Param('id') id: string,
    @Body() dto: CancelFlightDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.flights.cancelFlight(id, user.sub, dto);
  }
 
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Edit times/airports of own Scheduled flight (FLT-05)',
  })
  @ApiResponse({ status: 200, description: 'Flight updated' })
  @ApiResponse({
    status: 400,
    description:
      'Invalid id, date, or schedule (e.g. arrival not after departure)',
  })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: "Not a moderator of this flight's airline",
  })
  @ApiResponse({ status: 404, description: 'Flight not found' })
  @ApiResponse({
    status: 409,
    description:
      'Flight not Scheduled, airports locked by bookings, or duplicate flight number on that date',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFlightDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.flights.update(id, user.sub, dto);
  }
 
  @Post(':id/cabins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiCookieAuth()
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
 
  @Patch(':id/cabins/:cabinId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Edit price/seat count of a cabin (FLT-05)' })
  @ApiResponse({ status: 200, description: 'Cabin updated' })
  @ApiResponse({
    status: 400,
    description: 'Invalid id, empty body, or invalid values',
  })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: "Not a moderator of this flight's airline",
  })
  @ApiResponse({ status: 404, description: 'Flight or cabin not found' })
  @ApiResponse({
    status: 409,
    description:
      'Flight not Scheduled, seats below booked + held, or seat counts changed during the update',
  })
  updateCabin(
    @Param('id') id: string,
    @Param('cabinId') cabinId: string,
    @Body() dto: UpdateCabinDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.flights.updateCabin(id, cabinId, user.sub, dto);
  }
 
  @Get(':id/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'View flight bookings and remaining seats (FLT-29)',
    description:
      'Airline moderators can view CONFIRMED and CANCELLED bookings for a flight operated by their assigned airline.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the flight' })
  @ApiOkResponse({
    description: 'Flight bookings and seats remaining by cabin',
  })
  @ApiBadRequestResponse({ description: 'Invalid flight ID' })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: 'Moderator is not assigned to this flight airline',
  })
  @ApiResponse({ status: 404, description: 'Flight not found' })
  getFlightBookings(
    @Param('id') flightId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.flights.getModeratorFlightBookings(flightId, user.sub);
  }
 
  @Get(':id/passengers/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Export flight passenger list as CSV (FLT-29)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the flight' })
  @ApiOkResponse({
    description: 'CSV passenger list',
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid flight ID' })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: 'Moderator is not assigned to this flight airline',
  })
  @ApiResponse({ status: 404, description: 'Flight not found' })
  async exportPassengerList(
    @Param('id') flightId: string,
    @CurrentUser() user: AuthPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.flights.getModeratorPassengerCsv(flightId, user.sub);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="flight-${flightId}-passengers.csv"`,
    });
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
 
  @ApiOperation({
    summary: 'Search flights (public)',
    description:
      'Lists SCHEDULED flights of active airlines on the given local departure date, ' +
      'keeping only cabins with enough free seats (total - booked - held) for the passengers. ' +
      'Returns "No flights found" when nothing matches. Open to guests and registered users.',
  })
  @ApiExtraModels(SearchFlightsDto)
  @ApiOkResponse({
    description:
      'Matching flights, or an empty list with the message "No flights found"',
  })
  @ApiBadRequestResponse({
    description: 'Invalid airport id, date format, or passenger count',
  })
  @Get('search')
  search(@Query() query: SearchFlightsDto) {
    return this.flights.search(query);
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Get flight details by ID (FLT-17)' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the flight' })
  @ApiResponse({
    status: 200,
    description: 'Flight details retrieved successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid flight ID format.' })
  @ApiResponse({ status: 404, description: 'Flight not found.' })
  async findOne(@Param('id') id: string) {
    return this.flights.findOne(id);
  }
}
 