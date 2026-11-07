import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ImageCategory, MAX_IMAGE_SIZE_BYTES, MAX_IMAGES } from './uploads.constants';
import { UploadsService } from './uploads.service';
import type { UploadedImage } from './uploads.service';

// first, cheap check on the declared type; the service then checks the real file bytes
const imageFilter = (_req: any, file: { mimetype: string }, cb: (err: Error | null, ok: boolean) => void) => {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') cb(null, true);
  else cb(new BadRequestException('Only JPG and PNG images are allowed'), false);
};

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // TODO (when the auth guard is available): add it to the two upload routes.
  // Until then, requests without req.user get 401.
  private requireUser(req: any): void {
    const id = req.user?.userId ?? req.user?.id ?? req.user?._id;
    if (!id) throw new UnauthorizedException('Authentication required');
  }

  // POST /uploads/images/:category  (post | activity | hotel), up to 5 files
  @Post('images/:category')
  @ApiOperation({ summary: 'GEN-08: upload up to 5 JPG/PNG images (max 5 MB each); returns their URLs' })
  @ApiParam({ name: 'category', enum: [ImageCategory.POST, ImageCategory.ACTIVITY, ImageCategory.HOTEL] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', MAX_IMAGES[ImageCategory.POST], {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: MAX_IMAGES[ImageCategory.POST] },
      fileFilter: imageFilter,
    }),
  )
  async uploadImages(
    @Param('category', new ParseEnumPipe(ImageCategory)) category: ImageCategory,
    @UploadedFiles() files: UploadedImage[],
    @Req() req: any,
  ) {
    this.requireUser(req);
    if (category === ImageCategory.AIRLINE) {
      throw new BadRequestException('Use POST /uploads/airline-logo for airline logos');
    }
    const urls = await this.uploadsService.saveImages(files, category);
    return { urls };
  }

  // POST /uploads/airline-logo  (exactly 1 file)
  @Post('airline-logo')
  @ApiOperation({ summary: 'GEN-08: upload 1 airline logo (JPG/PNG, max 5 MB); returns its URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
      fileFilter: imageFilter,
    }),
  )
  async uploadLogo(@UploadedFile() file: UploadedImage, @Req() req: any) {
    this.requireUser(req);
    const [url] = await this.uploadsService.saveImages(file ? [file] : [], ImageCategory.AIRLINE);
    return { url };
  }

  // GET /uploads/:category/:filename  (public: this is the URL the images are served from)
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
    res.sendFile(filePath);
  }
}