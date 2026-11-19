import { ActivitiesController } from './activities.controller';
import { type AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { Session } from '../auth/schemas/session.schema';
import { AccountStatus, User } from '../users/schemas/user.schema';
import { ActivitiesService } from './activities.service';

describe('ITN-10 controller', () => {
  const service = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const controller = new ActivitiesController(service as never);
  const req = {
    user: { sub: 'owner', role: 'user', sid: 'session' },
    body: {},
  } as AuthenticatedRequest;
  beforeEach(() => jest.clearAllMocks());
  it('passes authenticated identity and route identifiers to creation', () => {
    const dto = { name: 'Visit', description: 'Museum' };
    controller.create(req, 'itinerary', 'day', dto);
    expect(service.create).toHaveBeenCalledWith(
      'owner',
      'itinerary',
      'day',
      dto,
    );
  });
  it('passes partial changes to update and only identity/ID to delete', () => {
    controller.update(req, 'activity', { time: null });
    controller.remove(req, 'activity');
    expect(service.update).toHaveBeenCalledWith('owner', 'activity', {
      time: null,
    });
    expect(service.remove).toHaveBeenCalledWith('owner', 'activity');
  });
  it('rejects unsupported raw fields before calling the service', () => {
    expect(() =>
      controller.update(
        { ...req, body: { dayId: 'other' } } as AuthenticatedRequest,
        'activity',
        {},
      ),
    ).toThrow('Validation failed');
    expect(service.update).not.toHaveBeenCalled();
  });
});

describe('ITN-12 HTTP routes', () => {
  const url = '/api/uploads/activity/680329ed-1150-49a5-b035-b0b7ef86424f.png';
  const filename = '680329ed-1150-49a5-b035-b0b7ef86424f.png';
  const activity = { id: 'activity', images: [url] };
  const service = {
    addImage: jest.fn().mockResolvedValue({ url }),
    removeImage: jest.fn().mockResolvedValue({ ...activity, images: [] }),
    removeImageByFilename: jest.fn(),
    findOne: jest.fn().mockResolvedValue(activity),
  };
  const cookie = `${ACCESS_COOKIE}=test-token`;
  const path = '/api/activities/activity';
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        { provide: ActivitiesService, useValue: service },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(), getOrThrow: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async () => ({ sub: 'owner', sid: 'session' }),
          },
        },
        {
          provide: getModelToken(Session.name),
          useValue: { findOneAndUpdate: async () => ({ _id: 'session' }) },
        },
        {
          provide: getModelToken(User.name),
          useValue: {
            findById: () => ({
              select: () => ({
                lean: async () => ({
                  status: AccountStatus.ACTIVE,
                  role: 'user',
                }),
              }),
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication on all activity image routes', async () => {
    await request(app.getHttpServer()).post(`${path}/images`).expect(401);
    await request(app.getHttpServer())
      .delete(`${path}/images`)
      .query({ url })
      .expect(401);
    await request(app.getHttpServer()).get(path).expect(401);
    expect(service.addImage).not.toHaveBeenCalled();
    expect(service.removeImage).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .delete(`${path}/images/${filename}`)
      .expect(401);
    expect(service.removeImageByFilename).not.toHaveBeenCalled();
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('passes the authenticated identity and multipart file to the service', async () => {
    const bytes = Buffer.from('test image bytes');
    await request(app.getHttpServer())
      .post(`${path}/images`)
      .set('Cookie', cookie)
      .attach('image', bytes, {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(201, { url });
    expect(service.addImage).toHaveBeenCalledWith(
      'owner',
      'activity',
      expect.objectContaining({ buffer: bytes, mimetype: 'image/png' }),
    );
  });

  it('rejects unsupported MIME types, extra files and oversized files', async () => {
    const imageOptions = { filename: 'test.png', contentType: 'image/png' };
    await request(app.getHttpServer())
      .post(`${path}/images`)
      .set('Cookie', cookie)
      .attach('image', Buffer.from('test'), {
        filename: 'test.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${path}/images`)
      .set('Cookie', cookie)
      .attach('image', Buffer.from('test'), imageOptions)
      .attach('image', Buffer.from('extra'), imageOptions)
      .expect(400);
    await request(app.getHttpServer())
      .post(`${path}/images`)
      .set('Cookie', cookie)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), imageOptions)
      .expect(413);
    expect(service.addImage).not.toHaveBeenCalled();
  });

  it('accepts the exact five-megabyte boundary', async () => {
    await request(app.getHttpServer())
      .post(`${path}/images`)
      .set('Cookie', cookie)
      .attach('image', Buffer.alloc(5 * 1024 * 1024), {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(service.addImage).toHaveBeenCalledWith(
      'owner',
      'activity',
      expect.objectContaining({ size: 5 * 1024 * 1024 }),
    );
  });

  it('reads image URLs and removes the exact URL with no request body', async () => {
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', cookie)
      .expect(200, activity);
    await request(app.getHttpServer())
      .delete(`${path}/images`)
      .set('Cookie', cookie)
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${path}/images`)
      .set('Cookie', cookie)
      .query({ url })
      .expect(200, { ...activity, images: [] });
    expect(service.findOne).toHaveBeenCalledWith('owner', 'activity');
    expect(service.removeImage).toHaveBeenCalledTimes(1);
    expect(service.removeImage).toHaveBeenCalledWith('owner', 'activity', url);
  });

  it('returns the updated activity on filename removal and 404 when repeated', async () => {
    service.removeImageByFilename
      .mockResolvedValueOnce({ ...activity, images: [] })
      .mockRejectedValueOnce(
        new NotFoundException('Image attachment not found'),
      );
    await request(app.getHttpServer())
      .delete(`${path}/images/${filename}`)
      .set('Cookie', cookie)
      .expect(200, { ...activity, images: [] });
    await request(app.getHttpServer())
      .delete(`${path}/images/${filename}`)
      .set('Cookie', cookie)
      .expect(404);
    expect(service.removeImageByFilename).toHaveBeenCalledTimes(2);
    expect(service.removeImageByFilename).toHaveBeenCalledWith(
      'owner',
      'activity',
      filename,
    );
    expect(service.removeImage).not.toHaveBeenCalled();
  });

  it('passes a decoded traversal attempt to validation and returns 400', async () => {
    const traversal = `../${filename}`;
    service.removeImageByFilename.mockRejectedValueOnce(
      new BadRequestException('Invalid activity image filename'),
    );
    await request(app.getHttpServer())
      .delete(`${path}/images/${encodeURIComponent(traversal)}`)
      .set('Cookie', cookie)
      .expect(400);
    expect(service.removeImageByFilename).toHaveBeenCalledWith(
      'owner',
      'activity',
      traversal,
    );
  });

  it('publishes the multipart upload and both removal routes in Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const routes = document.paths['/api/activities/{id}/images'];
    expect(routes?.post?.requestBody).toMatchObject({
      content: {
        'multipart/form-data': {
          schema: {
            required: ['image'],
            properties: { image: { type: 'string', format: 'binary' } },
          },
        },
      },
    });
    expect(routes?.delete?.requestBody).toBeUndefined();
    const byFilename =
      document.paths['/api/activities/{id}/images/{imageId}']?.delete;
    expect(byFilename?.requestBody).toBeUndefined();
    expect(byFilename?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path', required: true }),
        expect.objectContaining({
          name: 'imageId',
          in: 'path',
          required: true,
        }),
      ]),
    );
    expect(routes?.delete?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'url', in: 'query', required: true }),
      ]),
    );
  });
});
