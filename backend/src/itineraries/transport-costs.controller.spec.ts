import { TransportCostsController } from './transport-costs.controller';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { IntercityTransportMode } from './schemas/transport-cost.schema';

describe('ITN-16 controller', () => {
  const service = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const controller = new TransportCostsController(service as never);
  const req = {
    user: { sub: 'owner', role: 'user', sid: 'session' },
    body: {},
  } as AuthenticatedRequest;
  beforeEach(() => jest.clearAllMocks());
  it('forwards the authenticated owner and supplied route/body fields', () => {
    const dto = {
      dayId: 'day',
      mode: IntercityTransportMode.TRAIN,
      fromCityId: 'cairo',
      toCityId: 'cairo',
      amount: 0,
      currency: 'USD',
    };
    controller.create(req, 'itinerary', dto);
    controller.update(req, 'entry', { amount: 2 });
    controller.remove(req, 'entry');
    expect(service.create).toHaveBeenCalledWith('owner', 'itinerary', dto);
    expect(service.update).toHaveBeenCalledWith('owner', 'entry', {
      amount: 2,
    });
    expect(service.remove).toHaveBeenCalledWith('owner', 'entry');
  });
  it('rejects unsupported raw fields instead of silently ignoring a parent override', () => {
    const bad = {
      ...req,
      body: { itineraryId: 'other' },
    } as AuthenticatedRequest;
    expect(() => controller.update(bad, 'entry', {})).toThrow(
      'Validation failed',
    );
    expect(service.update).not.toHaveBeenCalled();
  });
});
