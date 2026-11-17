// airlines.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AirlinesService } from './airlines.service';
import { CreateAirlineDto } from './dto/create-airline.dto';
import { UpdateAirlineDto } from './dto/update-airline.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import {
  JwtAuthGuard,
  type AuthPayload,
} from '../common/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedImage } from '../uploads/uploads.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { imageUploadOptions } from '../uploads/image-upload.options';
import { ImageCategory } from '../uploads/uploads.constants';
import { SetBaggagePolicyDto } from './dto/set-baggage-policy.dto';

@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlines: AirlinesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.airlines.findOne(id);
  }

  @ApiOperation({ summary: 'FLT-01: create an airline profile (admin only)' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 201, description: 'Airline created' })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed (e.g. code is not 2-3 uppercase letters or digits)',
  })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({
    status: 409,
    description: 'An airline with this name or code already exists',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateAirlineDto) {
    return this.airlines.create(dto);
  }

  @ApiOperation({
    summary: 'FLT-01: edit own airline profile (airline moderator only)',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Airline updated; returns the updated airline',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid airline id or validation failed',
  })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: 'Not an airline moderator, or not assigned to this airline',
  })
  @ApiResponse({ status: 404, description: 'Airline not found' })
  @ApiResponse({
    status: 409,
    description: 'Another airline already uses this name or code',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @Patch(':id')
  update(
    @Param('id') id: string, // airline id from the URL
    @Body() dto: UpdateAirlineDto,
    @CurrentUser() user: AuthPayload, // user id from the cookie
  ) {
    return this.airlines.update(id, dto, user);
  }

  @ApiOperation({
    summary:
      'FLT-01 / GEN-08: upload own airline logo (airline moderator only)',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 201,
    description: 'Logo stored; returns the airline with its new logoUrl',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid airline id, no file, or the file is not a valid JPG/PNG image',
  })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 403,
    description: 'Not an airline moderator, or not assigned to this airline',
  })
  @ApiResponse({ status: 404, description: 'Airline not found' })
  @ApiResponse({ status: 413, description: 'Image is larger than 5 MB' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('file', imageUploadOptions(ImageCategory.AIRLINE)),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: UploadedImage,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.airlines.setLogo(id, file, user);
  }

  @ApiCookieAuth()
  @Put(':id/baggage-policy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'Define extra baggage policy for an airline (FLT-08)',
    description:
      'Sets the price per extra bag (>0) and maximum extra bags per passenger (>=0). Weight limit matches each cabin allowance.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the airline' })
  @ApiResponse({
    status: 200,
    description: 'Extra baggage policy updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request: Invalid airline ID or invalid policy values.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized: Missing or invalid authentication cookie.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden: User is not the assigned moderator for this airline.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Not Found: The airline was removed while the request was processed.',
  })
  async setBaggagePolicy(
    @Param('id') id: string,
    @Body() dto: SetBaggagePolicyDto,
    @CurrentUser() userId: AuthPayload,
  ) {
    return this.airlines.setBaggagePolicy(id, dto, userId);
  }
}
