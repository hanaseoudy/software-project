import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingType } from '../payments/enums/payment.enums';
import { PoliciesService } from './policies.service';

const id = '507f1f77bcf86cd799439011';
const owner = '507f1f77bcf86cd799439012';

describe.each([BookingType.FLIGHT, BookingType.HOTEL])('PAY-02 %s', (type) => {
  let booking: any;
  let model: any;
  let service: PoliciesService;
  beforeEach(() => {
    booking = { user: owner, status: 'PENDING_PAYMENT', holdExpiresAt: new Date(Date.now() + 60000) };
    model = {
      findById: jest.fn(() => {
        const q = { populate: () => q, lean: async () => ({ ...booking }) };
        return q;
      }),
      updateOne: jest.fn(async (filter, update) => {
        if (booking.user === filter.user && filter.status.$in.includes(booking.status) &&
            booking.holdExpiresAt && booking.holdExpiresAt > new Date() && booking.policiesAcceptedAt == null) {
          booking.policiesAcceptedAt = update.$set.policiesAcceptedAt;
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      }),
    };
    service = new PoliciesService(model, model);
  });
  it('stores a timestamp and preserves it on repeated acceptance', async () => {
    const first = await service.acceptPolicies(type, id, owner);
    const second = await service.acceptPolicies(type, id, owner);
    expect(first.acceptedAt).toEqual(booking.policiesAcceptedAt);
    expect(second.acceptedAt).toEqual(first.acceptedAt);
    expect(model.updateOne).toHaveBeenCalledTimes(1);
    expect(model.updateOne.mock.calls[0][0]).toMatchObject({ policiesAcceptedAt: null, holdExpiresAt: { $gt: expect.any(Date) }, $expr: { $gt: ['$holdExpiresAt', '$$NOW'] } });
  });
  it('preserves the timestamp for concurrent requests', async () => {
    const results = await Promise.all([service.acceptPolicies(type, id, owner), service.acceptPolicies(type, id, owner)]);
    expect(results[0].acceptedAt).toEqual(results[1].acceptedAt);
    expect(results[0].acceptedAt).toEqual(booking.policiesAcceptedAt);
  });
  it.each([undefined, new Date(0)])('rejects a missing or expired hold', async (expiry) => {
    booking.holdExpiresAt = expiry;
    await expect(service.acceptPolicies(type, id, owner)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects expiry during the update', async () => {
    model.updateOne.mockImplementationOnce(async () => { booking.holdExpiresAt = new Date(0); return { modifiedCount: 0 }; });
    await expect(service.acceptPolicies(type, id, owner)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects when no timestamp was saved', async () => {
    model.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(service.acceptPolicies(type, id, owner)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts a null timestamp', async () => {
    booking.policiesAcceptedAt = null;
    const result = await service.acceptPolicies(type, id, owner);
    expect(result.acceptedAt).toEqual(booking.policiesAcceptedAt);
  });
  it.each(['HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED'])('rejects status %s', async status => {
    booking.status = status;
    await expect(service.acceptPolicies(type, id, owner)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects another user', async () => {
    await expect(service.acceptPolicies(type, id, 'other')).rejects.toBeInstanceOf(ForbiddenException);
    expect(model.updateOne).not.toHaveBeenCalled();
  });
  it('rechecks ownership and status after a failed update', async () => {
    model.updateOne.mockImplementationOnce(async () => { booking.user = 'other'; return { modifiedCount: 0 }; });
    await expect(service.acceptPolicies(type, id, owner)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
