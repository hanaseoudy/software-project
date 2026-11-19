import { PublicItinerariesController, PublicItineraryCloneController } from './public-itineraries.controller';

describe('PublicItinerariesController search (ITN-21)', () => {
  const service = { findPublic: jest.fn().mockResolvedValue({ items: [] }) };
  const controller = new PublicItinerariesController(service as never);
  const req = (query: Record<string, string>) => ({ query, headers: {} }) as never;

  beforeEach(() => service.findPublic.mockClear());

  it('passes page and all ITN-21 filters to the service', async () => {
    const query = { page: 2, keyword: 'cairo', minDays: 1, maxDays: 7, country: 'EG', city: 'cairo' };
    await controller.search(req({ page: '2', keyword: 'cairo', minDays: '1', maxDays: '7', country: 'EG', city: 'cairo' }), query);
    expect(service.findPublic).toHaveBeenCalledWith(2, { keyword: 'cairo', minDays: 1, maxDays: 7, country: 'EG', city: 'cairo' });
  });

  it('clones for the logged-in user', async () => {
    const clonePublic = jest.fn().mockResolvedValue({ id: 'copy' });
    const cloning = new PublicItineraryCloneController({ clonePublic } as never);
    await cloning.clone({ user: { sub: 'user-1', role: 'USER', sid: 's' } } as never, 'source');
    expect(clonePublic).toHaveBeenCalledWith('user-1', 'source');
  });

  it('still rejects unsupported query parameters', () => {
    expect(() => controller.search(req({ visibility: 'PRIVATE' }), {})).toThrow(expect.objectContaining({ status: 400 }));
    expect(service.findPublic).not.toHaveBeenCalled();
  });
});
