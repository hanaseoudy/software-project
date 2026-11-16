import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { BlogService } from './blog.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

describe('BLG-04 / BLG-07 ownership and validation', () => {
  const author = new Types.ObjectId();
  const other = new Types.ObjectId();
  const id = new Types.ObjectId();
  const query = (value: unknown) => ({ exec: jest.fn().mockResolvedValue(value), session: jest.fn().mockReturnThis() });
  let service: BlogService;
  let posts: any;
  let comments: any;
  let likes: any;
  let comment: any;
  beforeEach(() => {
    comment = { _id: id, post: new Types.ObjectId(), author, text: 'Old', get: () => new Date('2026-11-01') };
    const db = { transaction: jest.fn(async (callback) => callback({})) };
    posts = { db, findById: jest.fn(), deleteOne: jest.fn(() => query({ deletedCount: 1 })), updateOne: jest.fn(() => query({ matchedCount: 1 })) };
    comments = { db, findById: jest.fn(() => query(comment)), findOneAndUpdate: jest.fn(() => query({ ...comment, text: 'New' })), deleteOne: jest.fn(() => query({ deletedCount: 1 })), deleteMany: jest.fn(() => query({ deletedCount: 2 })) };
    likes = { deleteMany: jest.fn(() => query({ deletedCount: 1 })) };
    service = new BlogService(posts, likes, comments, {} as any);
  });
  it('rejects another author editing a post', async () => {
    posts.findById.mockReturnValue(query({ author }));
    await expect(service.update(other.toString(), id.toString(), { title: 'New' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects another author deleting a post without deleting dependencies', async () => {
    posts.findById.mockReturnValue(query({ author }));
    await expect(service.deletePost(other.toString(), id.toString())).rejects.toBeInstanceOf(ForbiddenException);
    expect(posts.deleteOne).not.toHaveBeenCalled();
    expect(comments.deleteMany).not.toHaveBeenCalled();
  });
  it('deletes a post and dependent records with the same session', async () => {
    posts.findById.mockReturnValue(query({ author }));
    await service.deletePost(author.toString(), id.toString());
    expect(posts.deleteOne).toHaveBeenCalledWith({ _id: id, author }, { session: {} });
    expect(comments.deleteMany).toHaveBeenCalledWith({ post: id }, { session: {} });
    expect(likes.deleteMany).toHaveBeenCalledWith({ post: id }, { session: {} });
  });
  it.each(['updateComment', 'deleteComment'] as const)('%s rejects another user', async method => {
    await expect(service[method](other.toString(), id.toString(), 'New')).rejects.toBeInstanceOf(ForbiddenException);
    expect(comments.deleteOne).not.toHaveBeenCalled();
    expect(comments.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('updates only comment text and preserves its creation date', async () => {
    const result = await service.updateComment(author.toString(), id.toString(), ' New ');
    expect(comments.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, author }, { $set: { text: 'New' } }, { new: true, runValidators: true });
    expect(result.createdAt).toEqual(new Date('2026-11-01'));
  });
  it('decrements the count with the deletion transaction, never below zero', async () => {
    await service.deleteComment(author.toString(), id.toString());
    expect(posts.updateOne).toHaveBeenCalledWith({ _id: comment.post, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } }, { session: {} });
  });
  it('does not decrement the count for a missing comment', async () => {
    comments.findById.mockReturnValue(query(null));
    await expect(service.deleteComment(author.toString(), id.toString())).rejects.toBeInstanceOf(NotFoundException);
    expect(posts.updateOne).not.toHaveBeenCalled();
  });
  it.each(['', ' ', 'x'.repeat(501), null])('rejects invalid comment text', async text => {
    await expect(service.updateComment(author.toString(), id.toString(), text)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['title', 'content', 'status', 'tags'])('rejects explicit null for post %s', async field => {
    expect(await validate(plainToInstance(UpdatePostDto, { [field]: null }))).not.toHaveLength(0);
  });
  it('allows partial post edits and normalizes tags', async () => {
    const dto = plainToInstance(UpdatePostDto, { tags: [' Egypt ', 'egypt'] });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.tags).toEqual(['egypt']);
  });
  it('validates the 500-character comment boundary', async () => {
    expect(await validate(plainToInstance(UpdateCommentDto, { text: 'x'.repeat(500) }))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateCommentDto, { text: 'x'.repeat(501) }))).not.toHaveLength(0);
  });
});
