import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BlogService } from './blog.service';
import { Post, PostStatus } from './schemas/post.schema';

describe('BlogService', () => {
  let service: BlogService;
  const postModel = { create: jest.fn() };
  const authorId = new Types.ObjectId().toString();

  const fakePost = (data: Record<string, unknown>) => ({
    _id: new Types.ObjectId(),
    images: [],
    likesCount: 0,
    commentsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  });

  beforeEach(async () => {
    postModel.create.mockReset();
    postModel.create.mockImplementation(async (data: Record<string, unknown>) => fakePost(data));

    const module: TestingModule = await Test.createTestingModule({
      providers: [BlogService, { provide: getModelToken(Post.name), useValue: postModel }],
    }).compile();

    service = module.get<BlogService>(BlogService);
  });

  it('creates a draft by default and takes the author from the logged-in user (BLG-01)', async () => {
    const result = await service.create(authorId, { title: 'Luxor', content: 'Body' });

    expect(postModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: PostStatus.DRAFT, tags: [], author: new Types.ObjectId(authorId) }),
    );
    expect(result).toMatchObject({ title: 'Luxor', content: 'Body', status: 'draft', author: authorId, tags: [] });
  });

  it('creates a published post with tags (BLG-01)', async () => {
    const result = await service.create(authorId, {
      title: 'Luxor',
      content: 'Body',
      status: PostStatus.PUBLISHED,
      tags: ['egypt'],
    });

    expect(result).toMatchObject({ status: 'published', tags: ['egypt'] });
  });
});