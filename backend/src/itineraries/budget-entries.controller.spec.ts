import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { BudgetEntriesController } from './budget-entries.controller';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { BudgetCategory } from './schemas/budget-entry.schema';
describe('ITN-14 controller', () => {
  const service = {
    create: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    totals: jest.fn(),
  };
  const conversion = { totals: jest.fn() };
  const controller = new BudgetEntriesController(service as never, conversion as never);
  const req = { user: { sub: 'owner' }, body: {} } as AuthenticatedRequest;
  beforeEach(() => jest.clearAllMocks());
  it('forwards every route with the authenticated owner', () => {
    const dto = { category: BudgetCategory.FOOD, amount: 0, currency: 'USD' };
    controller.create(req, 'parent', 'day', dto);
    controller.list(req, 'parent', 'day');
    controller.update(req, 'entry', { amount: 2 });
    controller.remove(req, 'entry');
    controller.totals(req, 'parent');
    expect(service.create).toHaveBeenCalledWith('owner', 'parent', 'day', dto);
    expect(service.list).toHaveBeenCalledWith('owner', 'parent', 'day');
    expect(service.update).toHaveBeenCalledWith('owner', 'entry', {
      amount: 2,
    });
    expect(service.remove).toHaveBeenCalledWith('owner', 'entry');
    expect(service.totals).toHaveBeenCalledWith('owner', 'parent');
  });
  it('only activates conversion and private cache headers for the opt-in request', () => {
    const response = { setHeader: jest.fn() };
    controller.totals(req, 'parent', { convert: 'preferred' }, response as never);
    expect(conversion.totals).toHaveBeenCalledWith('owner', 'parent');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(service.totals).not.toHaveBeenCalled();
  });
  it.each(['dayId', 'itineraryId', 'userId', '__v'])(
    'rejects raw field %s before mutation',
    (field) => {
      const bad = {
        ...req,
        body: { [field]: 'override' },
      } as AuthenticatedRequest;
      expect(() =>
        controller.create(bad, 'parent', 'day', {
          category: BudgetCategory.FOOD,
          amount: 0,
          currency: 'USD',
        }),
      ).toThrow('Validation failed');
      expect(() => controller.update(bad, 'entry', {})).toThrow(
        'Validation failed',
      );
      expect(service.create).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['create', RequestMethod.POST, 'itineraries/:id/days/:dayId/budgets'],
    ['list', RequestMethod.GET, 'itineraries/:id/days/:dayId/budgets'],
    ['update', RequestMethod.PATCH, 'budgets/:id'],
    ['remove', RequestMethod.DELETE, 'budgets/:id'],
    ['totals', RequestMethod.GET, 'itineraries/:id/budget-summary'],
  ] as const)('registers %s with the approved method and path', (handler, method, route) => {
    expect(Reflect.getMetadata(METHOD_METADATA, controller[handler])).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, controller[handler])).toBe(route);
  });
});
