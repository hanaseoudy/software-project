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
} from '@nestjs/common';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { AirlinesService } from './airlines.service';
import { CreateAirlineDto } from './dto/create-airline.dto';
import { UpdateAirlineDto } from './dto/update-airline.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedImage } from '../uploads/uploads.service';

@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlines: AirlinesService) {}

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.airlines.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateAirlineDto) {
    return this.airlines.create(dto);
  }

  @Roles(Role.AIRLINE_MODERATOR)
  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string, // airline id from the URL
    @Body() dto: UpdateAirlineDto,
    @CurrentUser() user: AuthPayload, // user id from the cookie
  ) {
    return this.airlines.update(id, dto, user);
  }

  @Roles(Role.AIRLINE_MODERATOR)
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadLogo(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: UploadedImage,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.airlines.setLogo(id, file, user);
  }
}
