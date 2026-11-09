import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const MAX_POST_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const URL_PREFIX = '/api/posts/images/';
const FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

export interface UploadedPostImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

// No disk writes occur in Multer: DTO and file validation complete first.
export const POST_IMAGE_UPLOAD_OPTIONS = {
  // Busboy signals limits when these thresholds are reached. The service
  // enforces the inclusive 5 MB boundary; allow all 5 files + 4 form fields.
  limits: {
    files: MAX_POST_IMAGES,
    fileSize: MAX_IMAGE_BYTES + 1,
    fields: 4,
    parts: 10,
  },
};

@Injectable()
export class PostImagesService {
  private readonly directory: string;
  private readonly logger = new Logger(PostImagesService.name);
  private readonly validator = new FileTypeValidator({
    fileType: /^image\/(jpeg|png)$/,
    overrideMimeType: true,
  });

  constructor(config: ConfigService) {
    this.directory = resolve(
      config.get<string>('BLOG_UPLOAD_DIR') ??
        join(process.cwd(), 'uploads', 'posts'),
    );
  }

  url(filename: string): string {
    if (!FILE_NAME.test(filename))
      throw new NotFoundException('Image not found');
    return URL_PREFIX + filename;
  }

  async save(files: UploadedPostImage[]): Promise<string[]> {
    if (files.length > MAX_POST_IMAGES) {
      throw new BadRequestException('A post can have at most 5 images');
    }
    for (const file of files) {
      if (file.buffer?.length > MAX_IMAGE_BYTES) {
        throw new PayloadTooLargeException('Each image must be at most 5 MB');
      }
      if (
        !Buffer.isBuffer(file.buffer) ||
        file.buffer.length === 0 ||
        file.size !== file.buffer.length
      ) {
        throw new BadRequestException(
          'Each image must be non-empty and at most 5 MB',
        );
      }
      const claimedType = file.mimetype;
      if (
        !(await this.validator.isValid(file)) ||
        file.mimetype !== claimedType
      ) {
        throw new BadRequestException(
          'Only JPG and PNG image files are accepted',
        );
      }
      // Reject signature-only/truncated files as well as mislabeled content.
      const complete =
        file.mimetype === 'image/png'
          ? file.buffer.length >= 45 &&
            file.buffer
              .subarray(-12)
              .equals(Buffer.from('0000000049454e44ae426082', 'hex'))
          : file.buffer.length >= 24 &&
            file.buffer.subarray(-2).equals(Buffer.from('ffd9', 'hex'));
      if (!complete) throw new BadRequestException('Incomplete image file');
    }

    const urls: string[] = [];
    try {
      if (files.length) await mkdir(this.directory, { recursive: true });
      for (const file of files) {
        const filename = `${randomUUID()}.${file.mimetype === 'image/png' ? 'png' : 'jpg'}`;
        const handle = await open(join(this.directory, filename), 'wx');
        urls.push(this.url(filename));
        try {
          await handle.writeFile(file.buffer);
        } finally {
          await handle.close();
        }
      }
      return urls;
    } catch {
      await this.remove(urls);
      throw new InternalServerErrorException('Could not store the images');
    }
  }

  async remove(urls: string[]): Promise<void> {
    for (const url of urls) {
      if (!url.startsWith(URL_PREFIX)) continue;
      const filename = url.slice(URL_PREFIX.length);
      if (!FILE_NAME.test(filename)) continue;
      try {
        await unlink(join(this.directory, filename));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn('Could not clean up a post image');
        }
      }
    }
  }

  async read(filename: string): Promise<StreamableFile> {
    this.url(filename); // Restrict access to generated filenames inside this directory.
    try {
      const buffer = await readFile(join(this.directory, filename));
      return new StreamableFile(buffer, {
        type: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
        disposition: 'inline',
        length: buffer.length,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Image not found');
      }
      throw new InternalServerErrorException('Could not read the image');
    }
  }
}
