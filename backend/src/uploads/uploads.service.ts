import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
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

  private detectType(buffer: Buffer): 'png' | 'jpg' | null {
    const isPng =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (isPng) return 'png';
    const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (isJpg) return 'jpg';
    return null;
  }

  async saveImages(files: UploadedImage[] | undefined, category: ImageCategory): Promise<string[]> {
    if (!files || files.length === 0) throw new BadRequestException('No image was provided');

    const max = MAX_IMAGES[category];
    if (files.length > max) {
      throw new BadRequestException(`At most ${max} image(s) can be uploaded for ${category}`);
    }

    const types = files.map((file) => {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new PayloadTooLargeException(`"${file.originalname}" is larger than 5 MB`);
      }
      const type = this.detectType(file.buffer);
      if (!type) {
        throw new BadRequestException(`"${file.originalname}" must be a JPG or PNG image`);
      }
      return type;
    });

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
      // if one write fails, remove the files already written
      await Promise.all(written.map((p) => fs.unlink(p).catch(() => undefined)));
      throw err;
    }
    return urls;
  }

  assertWithinLimit(category: ImageCategory, existingCount: number, newCount: number) {
    const max = MAX_IMAGES[category];
    if (existingCount + newCount > max) {
      throw new BadRequestException(
        `A ${category} can have at most ${max} image(s) (it already has ${existingCount})`,
      );
    }
  }

  /** Other modules call this to make sure a URL was really created by this service. */
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