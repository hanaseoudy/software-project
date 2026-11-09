import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { BlogService } from './blog.service';
import { PostDocument, PostStatus } from './schemas/post.schema';
import { PostImagesService } from './post-images.service';

describe('BlogService', () => {
  const author = new Types.ObjectId();
  const postId = new Types.ObjectId();
  const url = '/api/posts/images/11111111-1111-4111-8111-111111111111.png';
  let service: BlogService;
  let post: any;
  let model: any;
  let images: any;

  beforeEach(() => {
    post = {
      _id: postId,
      author,
      title: 'Trip',
      content: 'Body',
      status: PostStatus.DRAFT,
      images: [],
      tags: [],
    };
    model = {
      create: jest
        .fn()
        .mockImplementation((data) => Promise.resolve({ ...post, ...data })),
      findById: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(post) }),
      findOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(post) }),
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };
    images = {
      save: jest.fn().mockResolvedValue([url]),
      remove: jest.fn().mockResolvedValue(undefined),
      url: jest.fn().mockReturnValue(url),
      read: jest.fn().mockResolvedValue('image'),
    };
    service = new BlogService(
      model as Model<PostDocument>,
      images as PostImagesService,
    );
  });

  it('stores uploaded URLs and an ObjectId author while preserving the response contract', async () => {
    const response = await service.createPost(String(author), {
      title: 'Trip',
      content: 'Body',
    });
    expect(model.create.mock.calls[0][0].author).toBeInstanceOf(Types.ObjectId);
    expect(response).toMatchObject({
      author: String(author),
      status: 'draft',
      images: [url],
    });
  });

  it('cleans up uploaded files when post creation fails', async () => {
    model.create.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.createPost(String(author), { title: 'Trip', content: 'Body' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(images.remove).toHaveBeenCalledWith([url]);
  });

  it('rejects another author before storing any files', async () => {
    await expect(
      service.addImages(String(new Types.ObjectId()), String(postId), []),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(images.save).not.toHaveBeenCalled();
  });

  it('cleans up if a concurrent append consumes the remaining image slots', async () => {
    await expect(
      service.addImages(String(author), String(postId), [{} as any]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(images.remove).toHaveBeenCalledWith([url]);
  });

  it('cleans up if the database fails during append', async () => {
    model.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('offline')),
    });
    await expect(
      service.addImages(String(author), String(postId), [{} as any]),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(images.remove).toHaveBeenCalledWith([url]);
  });

  it('does not delete a file when detaching it from the database fails', async () => {
    model.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('offline')),
    });
    await expect(
      service.removeImage(String(author), String(postId), 'image.png'),
    ).rejects.toThrow('offline');
    expect(images.remove).not.toHaveBeenCalled();
  });

  it('does not expose draft images to guests or another author', async () => {
    await expect(service.readImage('image.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.readImage('image.png', String(new Types.ObjectId())),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(images.read).not.toHaveBeenCalled();
    await expect(service.readImage('image.png', String(author))).resolves.toBe(
      'image',
    );
  });

  it('serves published images publicly but keeps hidden images private', async () => {
    post.status = PostStatus.PUBLISHED;
    await expect(service.readImage('image.png')).resolves.toBe('image');
    post.isHidden = true;
    await expect(service.readImage('image.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
