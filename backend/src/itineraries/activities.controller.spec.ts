import { ActivitiesController } from './activities.controller';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';

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
