import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

describe('BlogController', () => {
  let controller: BlogController;
  const blogService = { create: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlogController],
      providers: [{ provide: BlogService, useValue: blogService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BlogController>(BlogController);
  });

  it('passes the logged-in user id as the author (BLG-01)', async () => {
    const dto = { title: 'Luxor', content: 'Body' };
    const req = { user: { sub: 'user-1', role: 'user' } } as AuthenticatedRequest;

    await controller.create(req, dto);

    expect(blogService.create).toHaveBeenCalledWith('user-1', dto);
  });
});