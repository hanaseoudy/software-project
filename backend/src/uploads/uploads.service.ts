import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { ImageCategory, MAX_IMAGE_SIZE_BYTES, MAX_IMAGES } from './uploads.constants';

export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILENAME_PATTERN = new RegExp(`^${UUID}\\.(jpg|png)$`);
const URL_PATTERN = new RegExp(`^/api/uploads/(post|activity|hotel|airline)/(${UUID}\\.(jpg|png))$`);

@Injectable()
export class UploadsService {
  private readonly root = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');

  /** Quick check of the first bytes of the file. */
  private detectType(buffer: Buffer): 'png' | 'jpg' | null {
    const isPng =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (isPng) return 'png';
    const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (isJpg) return 'jpg';
    return null;
  }

  /** Full check: the image must open and decode completely (rejects corrupted or cut-off files). */
  private async validateImage(file: UploadedImage): Promise<'png' | 'jpg'> {
    const sig = this.detectType(file.buffer);
    if (!sig) throw new BadRequestException(`"${file.originalname}" must be a JPG or PNG image`);
    try {
      const image = sharp(file.buffer, { failOn: 'warning' });
      const meta = await image.metadata();
      if (meta.format !== (sig === 'png' ? 'png' : 'jpeg') || !meta.width || !meta.height) {
        throw new Error('format mismatch');
      }
      await image.clone().raw().toBuffer();
    } catch {
      throw new BadRequestException(`"${file.originalname}" is corrupted or not a valid JPG/PNG image`);
    }
    return sig;
  }

  /** Validates ALL files first, then stores them (all or nothing). Returns the served URLs. */
  async saveImages(files: UploadedImage[] | undefined, category: ImageCategory): Promise<string[]> {
    if (!files || files.length === 0) throw new BadRequestException('No image was provided');

    const max = MAX_IMAGES[category];
    if (files.length > max) {
      throw new BadRequestException(`At most ${max} image(s) can be uploaded for ${category}`);
    }

    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new PayloadTooLargeException(`"${file.originalname}" is larger than 5 MB`);
      }
    }
    const types = await Promise.all(files.map((file) => this.validateImage(file)));

    const dir = path.join(this.root, category);
    await fs.mkdir(dir, { recursive: true });

    const urls: string[] = [];
    const written: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const filename = `${randomUUID()}.${types[i]}`;
        const full = path.join(dir, filename);
        await fs.writeFile(full, files[i].buffer);
        written.push(full);
        urls.push(`/api/uploads/${category}/${filename}`);
      }
    } catch (err) {
      await Promise.all(written.map((p) => fs.unlink(p).catch(() => undefined)));
      throw err;
    }
    return urls;
  }

  /** Feature modules call this, passing the owner's current image URLs, to enforce the limit across uploads. */
  async saveForOwner(
    files: UploadedImage[] | undefined,
    category: ImageCategory,
    existingUrls: string[] = [],
  ): Promise<string[]> {
    if (!files || files.length === 0) throw new BadRequestException('No image was provided');
    this.assertWithinLimit(category, existingUrls.length, files.length);
    return this.saveImages(files, category);
  }

  assertWithinLimit(category: ImageCategory, existingCount: number, newCount: number) {
    const max = MAX_IMAGES[category];
    if (existingCount + newCount > max) {
      throw new BadRequestException(
        `A ${category} can have at most ${max} image(s) (it already has ${existingCount})`,
      );
    }
  }

  /** Makes sure a URL was really created by this service. */
  isStoredUrl(category: ImageCategory, url: string): boolean {
    const m = URL_PATTERN.exec(url);
    return !!m && m[1] === category;
  }

  async deleteByUrl(url: string): Promise<void> {
    const match = URL_PATTERN.exec(url);
    if (!match) return;
    try {
      await fs.unlink(path.join(this.root, match[1], match[2]));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async getFilePath(category: ImageCategory, filename: string): Promise<string> {
    if (!FILENAME_PATTERN.test(filename)) throw new NotFoundException('Image not found');
    const filePath = path.join(this.root, category, filename);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Image not found');
    }
    return filePath;
  }
}