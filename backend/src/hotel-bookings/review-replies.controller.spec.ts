import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { ReviewRepliesController } from './review-replies.controller';
import { ReviewRepliesService } from './review-replies.service';

describe('ReviewRepliesController (HTL-26)', () => {
  const service = { reply: jest.fn() };

  it('passes the review id, the body and the logged-in moderator to the service', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReviewRepliesController],
      providers: [{ provide: ReviewRepliesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(ReviewRepliesController);
    service.reply.mockResolvedValue({ id: 'r1' });

    const req = { user: { sub: 'm1', role: UserRole.MODERATOR } } as never;
    await expect(controller.reply('r1', { text: 'Thanks' }, req)).resolves.toEqual({ id: 'r1' });
    expect(service.reply).toHaveBeenCalledWith('r1', { text: 'Thanks' }, { sub: 'm1', role: UserRole.MODERATOR });
  });
});
