import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_IMAGE_BYTES, PostImagesService } from './post-images.service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAALSURBVBhXY2AAAgAABQABqtXIUQAAAABJRU5ErkJggg==',
  'base64',
);
const jpg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==',
  'base64',
);
const upload = (buffer: Buffer, mimetype = 'image/png') => ({
  buffer,
  size: buffer.length,
  mimetype,
});

describe('PostImagesService (real filesystem)', () => {
  let directory: string;
  let service: PostImagesService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'blg-images-unit-'));
    service = new PostImagesService(
      new ConfigService({ BLOG_UPLOAD_DIR: directory }),
    );
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores and serves PNG and JPG bytes under generated URLs and removes them', async () => {
    const urls = await service.save([upload(png), upload(jpg, 'image/jpeg')]);
    expect(urls[0]).toMatch(/^\/api\/posts\/images\/[\da-f-]+\.png$/);
    expect(urls[1]).toMatch(/\.jpg$/);
    const file = await service.read(urls[0].split('/').pop()!);
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(png);
    expect(file.getHeaders().type).toBe('image/png');
    await service.remove(urls);
    expect(await readdir(directory)).toEqual([]);
  });

  it.each([
    ['empty', Buffer.alloc(0), 'image/png'],
    ['fake PNG', Buffer.from('<script>alert(1)</script>'), 'image/png'],
    ['truncated PNG', png.subarray(0, 24), 'image/png'],
    ['truncated JPG', jpg.subarray(0, 24), 'image/jpeg'],
    ['mislabeled JPG', jpg, 'image/png'],
    ['unsupported type', Buffer.from('GIF89a1234567890'), 'image/gif'],
  ])('rejects %s before writing files', async (_name, buffer, mimetype) => {
    await expect(
      service.save([upload(png), upload(buffer, mimetype)]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects six images before writing files', async () => {
    await expect(
      service.save(Array.from({ length: 6 }, () => upload(png))),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await readdir(directory)).toEqual([]);
  });

  it('returns 413 for oversized files without writing any files', async () => {
    await expect(
      service.save([upload(Buffer.alloc(MAX_IMAGE_BYTES + 1))]),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects path traversal and returns 404 for missing files', async () => {
    await expect(service.read('../secret.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.read('11111111-1111-4111-8111-111111111111.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
