import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ItineraryExportService } from './itinerary-export.service';

@ApiTags('itineraries')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItineraryExportController {
  constructor(private readonly exportService: ItineraryExportService) {}

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Export or print my itinerary as PDF (ITN-28)',
    description:
      'Downloads the PDF of one of my own itineraries: title, countries, dates, and for every day its date, city, notes and activities (time, name, description, cost). By default the file is downloaded; with ?inline=true the browser opens it so it can be printed. The standard PDF font is used, so characters outside Latin-1 (for example Arabic) are shown as "?".',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiQuery({
    name: 'inline',
    required: false,
    type: Boolean,
    description: 'true = open in the browser (print); default = download',
  })
  @ApiOkResponse({
    description: 'PDF file',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiBadRequestResponse({ description: 'inline must be true or false' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Itinerary not found (or not yours)' })
  async exportPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const asInline = parseInline(inline);
    const { filename, pdf } = await this.exportService.exportPdf(
      req.user!.sub,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${asInline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(pdf);
  }
}

function parseInline(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new BadRequestException({
    message: 'Validation failed',
    errors: { inline: ['Inline must be true or false'] },
  });
}
