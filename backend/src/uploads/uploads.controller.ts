import { Controller, Get, Param, ParseEnumPipe, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ImageCategory } from './uploads.constants';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get(':category/:filename')
  @ApiOperation({ summary: 'GEN-08: serve a stored image by URL' })
  @ApiParam({ name: 'category', enum: ImageCategory })
  async serve(
    @Param('category', new ParseEnumPipe(ImageCategory)) category: ImageCategory,
    @Param('filename') filename: string,
    @Res() res: any,
  ) {
    const filePath = await this.uploadsService.getFilePath(category, filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  }
}