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

// the parts of a multer (memory storage) file that we use
export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const FILENAME_PATTERN = /^[a-f0-9-]{36}\.(jpg|png)$/;
const URL_PATTERN = /^\/uploads\/(post|activity|hotel|airline)\/([a-f0-9-]{36}\.(jpg|png))$/;

@Injectable()
export class UploadsService {
  // files live in backend/uploads/<category>/ (git-ignored)
  private readonly root = path.join(process.cwd(), 'uploads');

  /** Look at the first bytes of the file: the client-sent mimetype can be faked. */
  private detectType(buffer: Buffer): 'png' | 'jpg' | null {
    const isPng =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (isPng) return 'png';
    const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (isJpg) return 'jpg';
    return null;
  }

  /**
   * Validates ALL files first, then stores them (all or nothing).
   * Returns the URLs the files are served from.
   */
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
    for (let i = 0; i < files.length; i++) {
      // never trust the original name: generate our own
      const filename = `${randomUUID()}.${types[i]}`;
      await fs.writeFile(path.join(dir, filename), files[i].buffer);
      urls.push(`/uploads/${category}/${filename}`);
    }
    return urls;
  }

  /**
   * For other modules (posts, activities, hotels, airlines): call this before attaching
   * new images, so the TOTAL stays within the limit (e.g. 5 per post).
   */
  assertWithinLimit(category: ImageCategory, existingCount: number, newCount: number) {
    const max = MAX_IMAGES[category];
    if (existingCount + newCount > max) {
      throw new BadRequestException(
        `A ${category} can have at most ${max} image(s) (it already has ${existingCount})`,
      );
    }
  }

  /** For other modules: remove a stored image when it is deleted from its owner. */
  async deleteByUrl(url: string): Promise<void> {
    const match = URL_PATTERN.exec(url);
    if (!match) return; // not one of our files
    try {
      await fs.unlink(path.join(this.root, match[1], match[2]));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err; // already gone is fine
    }
  }

  /** Absolute path of a stored file, or 404. The strict filename pattern blocks path tricks. */
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
