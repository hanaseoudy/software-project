import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BlogService } from './blog.service';
import { Post, PostStatus } from './schemas/post.schema';

describe('BlogService', () => {
  let service: BlogService;
  const postModel: Record<string, jest.Mock> = { create: jest.fn() };
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

  it('lists only the user\'s own posts, drafts included, 10 per page (BLG-03, GEN-05)', async () => {
    const draft = fakePost({ title: 'Draft', status: PostStatus.DRAFT, author: authorId });
    const query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([draft]),
    };
    postModel.find = jest.fn().mockReturnValue(query);
    postModel.countDocuments = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(11) });

    const result = await service.listMine(authorId, 2);

    expect(postModel.find).toHaveBeenCalledWith({ author: new Types.ObjectId(authorId) });
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      items: [
        {
          id: draft._id.toString(),
          title: 'Draft',
          status: 'draft',
          createdAt: draft.createdAt,
          likesCount: 0,
          commentsCount: 0,
        },
      ],
      total: 11,
      page: 2,
      pageSize: 10,
      totalPages: 2,
    });
  });
});