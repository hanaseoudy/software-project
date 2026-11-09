// Run with BLOG_TEST_MONGODB_URI=mongodb://127.0.0.1:27028.
// Uses a unique disposable database and temp directory; never uses the application's .env.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import request from 'supertest';
import { ACCESS_COOKIE } from '../src/auth/auth.cookies';
import { BlogModule } from '../src/blog/blog.module';
import { MAX_IMAGE_BYTES } from '../src/blog/post-images.service';
import { Post, PostDocument } from '../src/blog/schemas/post.schema';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAALSURBVBhXY2AAAgAABQABqtXIUQAAAABJRU5ErkJggg==',
  'base64',
);
const secret = 'local-blog-integration-test-secret';
const author = new Types.ObjectId().toString();
const otherAuthor = new Types.ObjectId().toString();

describe('Blog HTTP and MongoDB integration (BLG-01, BLG-10, GEN-08)', () => {
  let app: INestApplication;
  let connection: Connection;
  let posts: Model<PostDocument>;
  let directory: string;
  let authorCookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    const uri = process.env.BLOG_TEST_MONGODB_URI;
    if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(uri)) {
      throw new Error(
        'Set BLOG_TEST_MONGODB_URI to a disposable local MongoDB, e.g. mongodb://127.0.0.1:27028',
      );
    }
    directory = await mkdtemp(join(tmpdir(), 'blg-http-'));
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({ JWT_ACCESS_SECRET: secret, BLOG_UPLOAD_DIR: directory }),
          ],
        }),
        MongooseModule.forRoot(uri, {
          dbName: 'blg_test_' + randomUUID().replaceAll('-', ''),
        }),
        BlogModule,
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    posts = app.get<Model<PostDocument>>(getModelToken(Post.name));
    const jwt = app.get(JwtService);
    authorCookie =
      ACCESS_COOKIE +
      '=' +
      jwt.sign({ sub: author, role: 'user' }, { secret, expiresIn: '5m' });
    otherCookie =
      ACCESS_COOKIE +
      '=' +
      jwt.sign({ sub: otherAuthor, role: 'user' }, { secret, expiresIn: '5m' });
  }, 30000);

  afterAll(async () => {
    try {
      if (connection) await connection.dropDatabase();
    } finally {
      if (app) await app.close();
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });

  const create = (count = 0, status = 'draft') => {
    const req = request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .field('title', ' Trip ')
      .field('content', ' Body ')
      .field('status', status)
      .field('tags', '["Rome","food","rome"]');
    for (let i = 0; i < count; i++)
      req.attach('images', png, {
        filename: 'trip.png',
        contentType: 'image/png',
      });
    return req;
  };

  it('rejects missing and invalid JWTs with the real authentication guard', async () => {
    await request(app.getHttpServer())
      .post('/api/posts')
      .send({ title: 'Trip', content: 'Body' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', ACCESS_COOKIE + '=invalid')
      .send({ title: 'Trip', content: 'Body' })
      .expect(401);
  });

  it('preserves JSON creation, ignores spoofed author, and supports ObjectId string queries', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .send({ title: ' Trip ', content: ' Body ', author: otherAuthor })
      .expect(201);
    expect(response.body).toMatchObject({
      title: 'Trip',
      content: 'Body',
      author,
      status: 'draft',
      images: [],
    });
    expect(
      await posts.findOne({ _id: response.body.id, author }).exec(),
    ).not.toBeNull();
  });

  it.each([
    { title: ' ', content: 'Body' },
    { title: 'a'.repeat(201), content: 'Body' },
    { title: 'Trip', content: '' },
    { title: 'Trip', content: 'Body', status: 'invalid' },
    { title: 'Trip', content: 'Body', tags: ['1', '2', '3', '4', '5', '6'] },
    { title: 'Trip', content: 'Body', tags: ['a'.repeat(31)] },
  ])('rejects invalid post fields %#', async (body) => {
    await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .send(body)
      .expect(400);
  });

  it('creates a published post with PNG images and serves the exact bytes by URL', async () => {
    const response = await create(1, 'published').expect(201);
    expect(response.body.tags).toEqual(['rome', 'food']);
    expect(response.body.images).toHaveLength(1);
    const image = await request(app.getHttpServer())
      .get(response.body.images[0])
      .expect(200);
    expect(image.body).toEqual(png);
    expect(image.headers['content-type']).toMatch(/^image\/png/);
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['cache-control']).toBe('private, no-store');
  });

  it('serves draft images to their author only', async () => {
    const response = await create(1).expect(201);
    const url = response.body.images[0];
    await request(app.getHttpServer()).get(url).expect(404);
    await request(app.getHttpServer())
      .get(url)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(url)
      .set('Cookie', authorCookie)
      .expect(200);
  });

  it('accepts exactly five images along with all four post fields', async () => {
    const response = await create(5).expect(201);
    expect(response.body.images).toHaveLength(5);
  });

  it('accepts an image exactly 5 MB in size', async () => {
    // Add a valid PNG text chunk before IEND, preserving a decodable image.
    const data = Buffer.alloc(MAX_IMAGE_BYTES - png.length - 12, 97);
    data.write('Comment\0');
    const chunkType = Buffer.from('tEXt');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([chunkType, data])));
    const exactSizePng = Buffer.concat([
      png.subarray(0, -12),
      length,
      chunkType,
      data,
      checksum,
      png.subarray(-12),
    ]);
    expect(exactSizePng.length).toBe(MAX_IMAGE_BYTES);
    const response = await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .field('title', 'Trip')
      .field('content', 'Body')
      .attach('images', exactSizePng, 'large.png')
      .expect(201);
    const image = await request(app.getHttpServer())
      .get(response.body.images[0])
      .set('Cookie', authorCookie)
      .expect(200);
    expect(image.body.equals(exactSizePng)).toBe(true);
  });

  it('adds and removes images only for the author', async () => {
    const response = await create(1).expect(201);
    const endpoint = '/api/posts/' + response.body.id + '/images';
    const filename = response.body.images[0].split('/').pop();
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Cookie', otherCookie)
      .attach('images', png, 'image.png')
      .expect(403);
    await request(app.getHttpServer())
      .delete(endpoint + '/' + filename)
      .set('Cookie', otherCookie)
      .expect(403);
    const added = await request(app.getHttpServer())
      .post(endpoint)
      .set('Cookie', authorCookie)
      .attach('images', png, 'image.png')
      .expect(201);
    expect(added.body.images).toHaveLength(2);
    const removed = await request(app.getHttpServer())
      .delete(endpoint + '/' + filename)
      .set('Cookie', authorCookie)
      .expect(200);
    expect(removed.body.images).toEqual([added.body.images[1]]);
    await request(app.getHttpServer())
      .get(response.body.images[0])
      .set('Cookie', authorCookie)
      .expect(404);
    await request(app.getHttpServer())
      .delete(endpoint + '/' + filename)
      .set('Cookie', authorCookie)
      .expect(404);
  });

  it('rejects no files, malformed IDs, and missing posts without storing images', async () => {
    const response = await create().expect(201);
    await request(app.getHttpServer())
      .post('/api/posts/' + response.body.id + '/images')
      .set('Cookie', authorCookie)
      .expect(400);
    for (const id of ['bad-id', new Types.ObjectId().toString()]) {
      await request(app.getHttpServer())
        .post('/api/posts/' + id + '/images')
        .set('Cookie', authorCookie)
        .attach('images', png, 'image.png')
        .expect(404);
    }
  });

  it('rejects excessive files, oversize files, spoofed content, and invalid metadata without orphan files', async () => {
    const before = await readdir(directory);
    const postCount = await posts.countDocuments();
    await create(6).expect(400);
    await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .field('title', 'Trip')
      .field('content', 'Body')
      .attach('images', Buffer.alloc(MAX_IMAGE_BYTES + 1), 'large.png')
      .expect(413);
    await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .field('title', 'Trip')
      .field('content', 'Body')
      .attach('images', Buffer.from('<script>bad</script>'), 'fake.png')
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/posts')
      .set('Cookie', authorCookie)
      .field('title', '')
      .field('content', 'Body')
      .attach('images', png, 'valid.png')
      .expect(400);
    expect(await posts.countDocuments()).toBe(postCount);
    expect(await readdir(directory)).toEqual(before);
  });

  it('enforces five total images under simultaneous uploads and removes rejected files', async () => {
    const response = await create(4).expect(201);
    const before = await readdir(directory);
    const endpoint = '/api/posts/' + response.body.id + '/images';
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post(endpoint)
          .set('Cookie', authorCookie)
          .attach('images', png, 'next.png'),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      201, 400, 400,
    ]);
    expect(
      (await posts.findById(response.body.id).exec())!.images,
    ).toHaveLength(5);
    expect(await readdir(directory)).toHaveLength(before.length + 1);
  });

  it('also enforces the image limit on document saves', async () => {
    await expect(
      posts.create({
        title: 'Trip',
        content: 'Body',
        author,
        images: Array.from({ length: 6 }, () => ({ url: '/image.png' })),
      }),
    ).rejects.toThrow('at most 5 images');
  });
});
