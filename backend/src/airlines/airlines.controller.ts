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
} from '@nestjs/common';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
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

@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlines: AirlinesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.airlines.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateAirlineDto) {
    return this.airlines.create(dto);
  }

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
}
