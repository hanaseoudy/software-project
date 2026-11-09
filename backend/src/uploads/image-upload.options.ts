import { BadRequestException } from '@nestjs/common';
import { ImageCategory, MAX_IMAGE_SIZE_BYTES, MAX_IMAGES } from './uploads.constants';

// Multer options for upload endpoints, e.g.
//   @UseInterceptors(FilesInterceptor('images', MAX_IMAGES[ImageCategory.POST], imageUploadOptions(ImageCategory.POST)))
// Multer stops early on too many files or a file over 5 MB; UploadsService still re-checks everything.
export const imageUploadOptions = (category: ImageCategory) => ({
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: MAX_IMAGES[category] },
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (e: Error | null, ok: boolean) => void) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') cb(null, true);
    else cb(new BadRequestException('Only JPG and PNG images are allowed'), false);
  },
});
