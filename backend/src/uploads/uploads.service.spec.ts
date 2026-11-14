import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { ImageCategory, MAX_IMAGE_SIZE_BYTES } from './uploads.constants';
import { UploadedImage, UploadsService } from './uploads.service';

describe('UploadsService filesystem regression', () => {
  let directory: string;
  let service: UploadsService;
  let image: UploadedImage;
  const previous = process.env.UPLOADS_DIR;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'travel-uploads-unit-'));
    process.env.UPLOADS_DIR = path.relative(process.cwd(), directory);
    service = new UploadsService();
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    image = { buffer, size: buffer.length, mimetype: 'image/png', originalname: 'test.png' };
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previous;
    if (directory && path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('travel-uploads-unit-')) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('stores, resolves an absolute path, retrieves and deletes a PNG with a relative UPLOADS_DIR', async () => {
    const [url] = await service.saveImages([image], ImageCategory.HOTEL);
    expect(await service.storedFileExists(ImageCategory.HOTEL, url)).toBe(true);
    const file = await service.getFilePath(ImageCategory.HOTEL, path.basename(url));
    expect(path.isAbsolute(file)).toBe(true);
    expect(await readFile(file)).toEqual(image.buffer);
    expect(await service.storedFileExists(ImageCategory.POST, url)).toBe(false);
    await service.deleteByUrl(url);
    expect(await service.storedFileExists(ImageCategory.HOTEL, url)).toBe(false);
    await expect(service.getFilePath(ImageCategory.HOTEL, path.basename(url))).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteByUrl(url)).resolves.toBeUndefined();
  });
  it('accepts a decoded JPEG', async () => {
    const buffer = await sharp(image.buffer).jpeg().toBuffer();
    const [url] = await service.saveImages([{ ...image, buffer, size: buffer.length }], ImageCategory.POST);
    expect(url).toMatch(/\.jpg$/);
  });
  it('rejects corrupt images and oversized files', async () => {
    await expect(service.saveImages([{ ...image, buffer: image.buffer.subarray(0, 20) }], ImageCategory.HOTEL)).rejects.toMatchObject({ status: 400 });
    await expect(service.saveImages([{ ...image, size: MAX_IMAGE_SIZE_BYTES + 1 }], ImageCategory.HOTEL)).rejects.toMatchObject({ status: 413 });
  });
  it('enforces batch and cumulative limits', async () => {
    await expect(service.saveImages(Array(6).fill(image), ImageCategory.HOTEL)).rejects.toMatchObject({ status: 400 });
    await expect(service.saveImages([image, image], ImageCategory.AIRLINE)).rejects.toMatchObject({ status: 400 });
    await expect(service.saveForOwner([image], ImageCategory.HOTEL, Array(5).fill('/existing'))).rejects.toMatchObject({ status: 400 });
  });
  it('rejects path traversal and missing files', async () => {
    await expect(service.getFilePath(ImageCategory.HOTEL, '../secret')).rejects.toMatchObject({ status: 404 });
    expect(await service.storedFileExists(ImageCategory.HOTEL, '/api/uploads/hotel/00000000-0000-0000-0000-000000000000.png')).toBe(false);
  });
});
