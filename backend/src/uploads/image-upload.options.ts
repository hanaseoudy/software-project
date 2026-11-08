import { BadRequestException } from '@nestjs/common';
import { MAX_IMAGE_SIZE_BYTES } from './uploads.constants';

export const imageUploadOptions = {
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 5 },
  fileFilter: (_req: any, file: { mimetype: string }, cb: (e: Error | null, ok: boolean) => void) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') cb(null, true);
    else cb(new BadRequestException('Only JPG and PNG images are allowed'), false);
  },
};