import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';

describe('BlogController', () => {
  it('uses the verified JWT subject as author, ignoring an author supplied in the body', async () => {
    const service = { createPost: jest.fn().mockResolvedValue({ id: 'post' }) };
    const controller = new BlogController(service as unknown as BlogService);
    const req = {
      user: { sub: 'verified-author', role: 'user' },
    } as AuthenticatedRequest;
    const dto = { title: 'Trip', content: 'Body', author: 'someone-else' };
    await controller.create(req, dto);
    expect(service.createPost).toHaveBeenCalledWith('verified-author', dto, []);
  });
});
