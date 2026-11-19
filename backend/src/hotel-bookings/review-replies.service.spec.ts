import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { UserRole } from '../users/schemas/user.schema';
import { ReviewRepliesService } from './review-replies.service';
import { Review } from './schemas/review.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
const findChain = (value: unknown) => ({ select: () => ({ lean: () => execResult(value) }) });

const NOW = new Date('2026-11-18T10:00:00.000Z');

describe('ReviewRepliesService (HTL-26)', () => {
  let service: ReviewRepliesService;
  const reviewModel = { findOne: jest.fn(), updateOne: jest.fn() };
  const assignmentModel = { exists: jest.fn() };

  const hotelId = new Types.ObjectId();
  const moderator = { sub: new Types.ObjectId().toString(), role: UserRole.MODERATOR, sid: 's' };
  const review = { _id: new Types.ObjectId(), hotel: hotelId, rating: 5, comment: 'Great stay' };
  const dto = { text: 'Thank you for staying with us.' };
  const run = (id = review._id.toString()) => service.reply(id, dto, moderator, NOW);

  beforeEach(async () => {
    jest.resetAllMocks();
    reviewModel.findOne.mockReturnValue(findChain(review));
    reviewModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));
    assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewRepliesService,
        { provide: getModelToken(Review.name), useValue: reviewModel },
        { provide: getModelToken(ModeratorAssignment.name), useValue: assignmentModel },
      ],
    }).compile();
    service = moduleRef.get(ReviewRepliesService);
  });

  it('saves the reply on the review and returns it', async () => {
    const result = await run();

    const [filter, update] = reviewModel.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: review._id, hidden: { $ne: true }, reply: { $exists: false } });
    expect(update.$set.reply).toEqual({
      text: 'Thank you for staying with us.',
      moderator: new Types.ObjectId(moderator.sub),
      repliedAt: NOW,
    });
    expect(result).toEqual({
      id: review._id.toString(),
      hotel: hotelId.toString(),
      rating: 5,
      comment: 'Great stay',
      reply: { text: 'Thank you for staying with us.', moderator: moderator.sub, repliedAt: NOW.toISOString() },
    });
  });

  it('only finds a review that is not hidden', async () => {
    await run();
    expect(reviewModel.findOne.mock.calls[0][0]).toEqual({ _id: review._id, hidden: { $ne: true } });
  });

  it('returns 404 for an unknown or hidden review and for an invalid id', async () => {
    reviewModel.findOne.mockReturnValue(findChain(null));
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    await expect(run('abc')).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewModel.updateOne).not.toHaveBeenCalled();
  });

  it('checks that the moderator is assigned to the hotel of THIS review', async () => {
    await run();
    expect(assignmentModel.exists.mock.calls[0][0]).toMatchObject({
      moderatorId: new Types.ObjectId(moderator.sub),
      providerType: 'hotel',
      providerId: hotelId,
    });
  });

  it('returns 403 and saves nothing for a moderator of another hotel', async () => {
    assignmentModel.exists.mockReturnValue(execResult(null));
    await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(reviewModel.updateOne).not.toHaveBeenCalled();
  });

  it('returns 409 when the review already has a reply (the atomic update matches nothing)', async () => {
    reviewModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));
    await expect(run()).rejects.toThrow('This review already has a reply');
  });

  it('shows a null comment when the review has only a rating', async () => {
    reviewModel.findOne.mockReturnValue(findChain({ ...review, comment: undefined }));
    expect((await run()).comment).toBeNull();
  });
});
