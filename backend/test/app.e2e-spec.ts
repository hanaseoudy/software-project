import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { SwaggerModule } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { createSwaggerConfig } from '../src/common/swagger.config';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { UploadsService } from '../src/uploads/uploads.service';
import { ImageCategory } from '../src/uploads/uploads.constants';

// setup-e2e.ts refuses remote databases before AppModule is imported.
describe('Backend regressions against disposable MongoDB', () => {
  let app: INestApplication;
  let db: Connection;
  let sequence = 0;
  const password = 'TestPassword123';
  const cookies = (res: request.Response): string[] =>
    (res.headers['set-cookie'] as unknown as string[]).map(value => value.split(';')[0]);
  const login = (email: string, suppliedPassword = password) => request(app.getHttpServer())
    .post('/api/auth/login').send({ email, password: suppliedPassword });
  const register = async (role = 'user') => {
    const email = `test${++sequence}@example.com`;
    const response = await request(app.getHttpServer()).post('/api/auth/register')
      .send({ firstName: 'Test', lastName: 'User', email, password, acceptTerms: true }).expect(201);
    if (role !== 'user') await db.model('User').updateOne({ email }, { $set: { role } });
    return { email, id: response.body.id };
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    db = app.get<Connection>(getConnectionToken());
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
  });
  afterAll(async () => {
    try {
      if (db && db.name === process.env.E2E_DATABASE_NAME && /^travel_e2e_[a-f0-9]{32}$/.test(db.name)) {
        await db.dropDatabase();
      }
    } finally {
      if (app) await app.close();
      const directory = process.env.UPLOADS_DIR;
      if (directory && path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('travel-uploads-e2e-')) {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
  it('enforces post/comment ownership, validates edits and cleans up deletions (BLG-04, BLG-07)', async () => {
    const owner = await register();
    const visitor = await register();
    const ownerCookie = cookies(await login(owner.email));
    const visitorCookie = cookies(await login(visitor.email));
    const server = app.getHttpServer();
    const created = await request(server).post('/api/posts').set('Cookie', ownerCookie)
      .send({ title: 'Before', content: 'Body', status: 'published', tags: ['egypt'] }).expect(201);
    const postId = created.body.id;
    await request(server).patch(`/api/posts/${postId}`).send({ title: 'After' }).expect(401);
    await request(server).patch(`/api/posts/${postId}`).set('Cookie', visitorCookie).send({ title: 'After' }).expect(403);
    await request(server).delete(`/api/posts/${postId}`).set('Cookie', visitorCookie).expect(403);
    for (const invalid of [{ title: ' ' }, { content: null }, { status: null }, { tags: null }]) {
      await request(server).patch(`/api/posts/${postId}`).set('Cookie', ownerCookie).send(invalid).expect(400);
    }
    const edited = await request(server).patch(`/api/posts/${postId}`).set('Cookie', ownerCookie)
      .send({ title: 'After', content: 'Edited body' }).expect(200);
    expect(edited.body).toMatchObject({ title: 'After', content: 'Edited body', tags: ['egypt'], status: 'published' });
    const commented = await request(server).post(`/api/posts/${postId}/comments`).set('Cookie', visitorCookie)
      .send({ text: 'Original' }).expect(201);
    const commentId = commented.body.id;
    await request(server).patch(`/api/comments/${commentId}`).send({ text: 'Edit' }).expect(401);
    await request(server).delete(`/api/comments/${commentId}`).expect(401);
    await request(server).patch(`/api/comments/${commentId}`).set('Cookie', ownerCookie).send({ text: 'Edit' }).expect(403);
    await request(server).delete(`/api/comments/${commentId}`).set('Cookie', ownerCookie).expect(403);
    for (const invalid of [{ text: ' ' }, { text: 'x'.repeat(501) }, { text: null }, { text: 'Edit', author: owner.id }]) {
      await request(server).patch(`/api/comments/${commentId}`).set('Cookie', visitorCookie).send(invalid).expect(400);
    }
    const updated = await request(server).patch(`/api/comments/${commentId}`).set('Cookie', visitorCookie)
      .send({ text: ' Edited ' }).expect(200);
    expect(updated.body).toMatchObject({ text: 'Edited', createdAt: commented.body.createdAt, author: { id: visitor.id } });
    const countFailure = jest.spyOn(db.model('Post'), 'updateOne').mockImplementationOnce(() => ({
      exec: () => Promise.reject(new Error('Simulated counter failure')),
    }) as any);
    try {
      await request(server).delete(`/api/comments/${commentId}`).set('Cookie', visitorCookie).expect(500);
    } finally {
      countFailure.mockRestore();
    }
    expect(await db.model('Comment').findById(commentId)).not.toBeNull();
    expect((await db.model('Post').findById(postId)).commentsCount).toBe(1);
    const deletions = await Promise.all([0, 1].map(() => request(server).delete(`/api/comments/${commentId}`).set('Cookie', visitorCookie)));
    expect(deletions.map(res => res.status).sort()).toEqual([204, 404]);
    expect((await db.model('Post').findById(postId)).commentsCount).toBe(0);
    await request(server).post(`/api/posts/${postId}/comments`).set('Cookie', visitorCookie).send({ text: 'Another' }).expect(201);
    await request(server).post(`/api/posts/${postId}/like`).set('Cookie', visitorCookie).expect(201);
    const cleanupFailure = jest.spyOn(db.model('Like'), 'deleteMany').mockImplementationOnce(() => ({
      exec: () => Promise.reject(new Error('Simulated cleanup failure')),
    }) as any);
    try {
      await request(server).delete(`/api/posts/${postId}`).set('Cookie', ownerCookie).expect(500);
    } finally {
      cleanupFailure.mockRestore();
    }
    expect(await db.model('Post').findById(postId)).not.toBeNull();
    expect(await db.model('Comment').countDocuments({ post: postId })).toBe(1);
    expect(await db.model('Like').countDocuments({ post: postId })).toBe(1);
    await request(server).delete(`/api/posts/${postId}`).set('Cookie', ownerCookie).expect(204);
    expect(await db.model('Comment').countDocuments({ post: postId })).toBe(0);
    expect(await db.model('Like').countDocuments({ post: postId })).toBe(0);
    await request(server).get(`/api/posts/${postId}`).expect(404);
    await request(server).delete(`/api/posts/${postId}`).set('Cookie', ownerCookie).expect(404);
    const draft = await request(server).post('/api/posts').set('Cookie', ownerCookie).send({ title: 'Draft', content: 'Body' }).expect(201);
    await request(server).patch(`/api/posts/${draft.body.id}`).set('Cookie', ownerCookie).send({ status: 'published' }).expect(200);
    await request(server).delete(`/api/posts/${draft.body.id}`).set('Cookie', ownerCookie).expect(204);
  }, 30000);
  it('serves the application with the production API prefix', async () => {
    await request(app.getHttpServer()).get('/api').expect(200).expect('Hello World!');
  });
  it('registers every Swagger cookie security scheme referenced by operations', () => {
    const document = SwaggerModule.createDocument(app, createSwaggerConfig());
    const schemes = document.components?.securitySchemes ?? {};
    expect(document.paths['/api/posts/{id}'].patch).toBeDefined();
    expect(document.paths['/api/posts/{id}'].delete).toBeDefined();
    expect(document.paths['/api/comments/{id}'].patch).toBeDefined();
    expect(document.paths['/api/comments/{id}'].delete).toBeDefined();
    expect(schemes.access_token).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'access_token' });
    expect(schemes.refresh_token).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'refresh_token' });
    for (const item of Object.values(document.paths)) {
      for (const operation of Object.values(item)) {
        for (const requirement of operation?.security ?? []) {
          for (const name of Object.keys(requirement)) expect(schemes).toHaveProperty(name);
        }
      }
    }
  });
  it('sets secure cookies, authenticates /me and revokes logout sessions', async () => {
    const user = await register();
    const response = await login(user.email).expect(200);
    expect(response.body).not.toHaveProperty('accessToken');
    for (const cookie of response.headers['set-cookie'] as unknown as string[]) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
    }
    const auth = cookies(response);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', auth).expect(200);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', auth).expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', auth).expect(401);
  });
  it('uses the current role and rejects a newly suspended user', async () => {
    const user = await register('admin');
    const auth = cookies(await login(user.email).expect(200));
    await db.model('User').updateOne({ email: user.email }, { $set: { role: 'user' } });
    await request(app.getHttpServer()).post('/api/hotels').set('Cookie', auth).send({}).expect(403);
    await db.model('User').updateOne({ email: user.email }, { $set: { status: 'suspended' } });
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', auth).expect(401);
    await login(user.email).expect(403);
  });
  it.each(['expiresAt', 'lastActivityAt'])('rejects a session whose %s is too old before TTL cleanup', async field => {
    const user = await register();
    const auth = cookies(await login(user.email).expect(200));
    await db.model('Session').updateMany({ user: user.id }, { $set: { [field]: new Date(Date.now() - 31 * 60_000) } });
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', auth).expect(401);
  });
  it('keeps a normally rotated session usable', async () => {
    const user = await register();
    const auth = cookies(await login(user.email).expect(200));
    const rotated = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', auth).expect(200);
    const renewed = cookies(rotated);
    expect(renewed.find(cookie => cookie.startsWith('refresh_token='))).not.toBe(auth.find(cookie => cookie.startsWith('refresh_token=')));
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', renewed).expect(200);
  });
  it('rotates a refresh token once under concurrent requests and retains replay revocation', async () => {
    const user = await register();
    const auth = cookies(await login(user.email).expect(200));
    const responses = await Promise.all([0, 1].map(() => request(app.getHttpServer())
      .post('/api/auth/refresh').set('Cookie', auth)));
    expect(responses.map(res => res.status).sort()).toEqual([200, 401]);
    const session = await db.model('Session').findOne({ user: user.id }).lean();
    expect(session?.revokedAt).toBeInstanceOf(Date);
    const winner = responses.find(res => res.status === 200)!;
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookies(winner)).expect(401);
  });
  it('characterizes unchanged ACC-05: fifth failure is 401; following attempt is locked for 15 minutes', async () => {
    const user = await register();
    const started = Date.now();
    for (let i = 0; i < 5; i++) await login(user.email, 'WrongPassword123').expect(401);
    const stored = await db.model('User').findOne({ email: user.email }).select('+lockedUntil +failedLoginAttempts');
    expect(stored!.lockedUntil.getTime()).toBeGreaterThanOrEqual(started + 15 * 60_000);
    expect(stored!.lockedUntil.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    expect(stored!.failedLoginAttempts).toBe(0);
    await login(user.email).expect(423);
    await db.model('User').updateOne({ email: user.email }, { $set: { lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 2 } });
    await login(user.email).expect(200);
    const reset = await db.model('User').findOne({ email: user.email }).select('+lockedUntil +failedLoginAttempts');
    expect(reset!.failedLoginAttempts).toBe(0);
    expect(reset!.lockedUntil).toBeNull();
  });
  it('rejects invalid hotel images and geography without writes, and preserves moderator ownership', async () => {
    const admin = await register('admin');
    const adminCookies = cookies(await login(admin.email).expect(200));
    const country = await db.model('Country').create({ code: 'EG', name: 'Egypt', currency: 'EGP' });
    const other = await db.model('Country').create({ code: 'FR', name: 'France', currency: 'EUR' });
    const city = await db.model('City').create({ cityId: 'CAI', name: 'Cairo', countryCode: 'EG' });
    const payload = { name: 'Test Hotel', address: 'Cairo', city: String(city._id), country: String(country._id), starRating: 4 };
    const create = (body: object) => request(app.getHttpServer()).post('/api/hotels').set('Cookie', adminCookies).send(body);
    const nullImage = await create({ ...payload, images: null }).expect(400);
    expect(nullImage.body.errors.images).toBeDefined();
    await create({ ...payload, country: String(other._id) }).expect(400);
    await create({ ...payload, images: ['/api/uploads/hotel/00000000-0000-0000-0000-000000000000.png'] }).expect(400);
    expect(await db.model('Hotel').countDocuments()).toBe(0);
    const hotel = await create(payload).expect(201);
    const moderator = await register('moderator');
    const modCookies = cookies(await login(moderator.email).expect(200));
    const update = (body: object) => request(app.getHttpServer()).patch(`/api/hotels/${hotel.body.id}`).set('Cookie', modCookies).send(body);
    await update({ name: 'New hotel name' }).expect(403);
    await db.model('ModeratorAssignment').create({ moderatorId: moderator.id, providerId: hotel.body.id, providerType: 'hotel' });
    const invalidUpdate = await update({ images: null }).expect(400);
    expect(invalidUpdate.body.errors.images).toBeDefined();
    await update({ country: String(other._id) }).expect(400);
    await update({ description: 'Updated' }).expect(200);
  });
  it('serves saved image bytes with no-cache and returns 404 after deletion', async () => {
    const uploads = app.get(UploadsService);
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
    const [url] = await uploads.saveImages([{ buffer, size: buffer.length, originalname: 'test.png', mimetype: 'image/png' }], ImageCategory.HOTEL);
    const response = await request(app.getHttpServer()).get(url).expect(200);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toEqual(buffer);
    await uploads.deleteByUrl(url);
    await request(app.getHttpServer()).get(url).expect(404);
  });
});
