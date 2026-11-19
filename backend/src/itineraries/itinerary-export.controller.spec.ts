import 'reflect-metadata';
import { ItineraryExportController } from './itinerary-export.controller';

jest.mock('@nestjs/common', () => {
  const noop = () => () => undefined;
  return {
    Controller: noop,
    Get: noop,
    Param: noop,
    Query: noop,
    Req: noop,
    Res: noop,
    UseGuards: noop,
    StreamableFile: class StreamableFile {
      constructor(public buffer: Buffer) {}
    },
    BadRequestException: class BadRequestException extends Error {
      constructor(public response?: unknown) {
        super('Bad Request');
      }
    },
  };
});
jest.mock('@nestjs/swagger', () => {
  const noop = () => () => undefined;
  return new Proxy({}, { get: () => noop });
});
jest.mock('../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class {},
}));
jest.mock('../auth/auth.cookies', () => ({ ACCESS_COOKIE: 'access' }));
jest.mock('./itinerary-export.service', () => ({
  ItineraryExportService: class {},
}));

describe('ItineraryExportController', () => {
  const service = {
    exportPdf: jest.fn().mockResolvedValue({
      filename: 'itinerary-egypt.pdf',
      pdf: Buffer.from('%PDF-x'),
    }),
  };
  const controller = new ItineraryExportController(service as never);
  const req = { user: { sub: 'owner', role: 'user', sid: 's' } } as never;
  const res = () => ({ set: jest.fn() });

  beforeEach(() => jest.clearAllMocks());

  it('downloads the PDF of the logged-in user’s itinerary', async () => {
    const r = res();
    const file = await controller.exportPdf(req, 'it1', undefined, r as never);
    expect(service.exportPdf).toHaveBeenCalledWith('owner', 'it1');
    expect(r.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="itinerary-egypt.pdf"',
      'Cache-Control': 'private, no-store',
    });
    expect(file).toBeDefined();
  });

  it('opens the PDF in the browser for printing with inline=true', async () => {
    const r = res();
    await controller.exportPdf(req, 'it1', 'true', r as never);
    expect(r.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'inline; filename="itinerary-egypt.pdf"',
      }),
    );
  });

  it('rejects any other value of inline before reading the itinerary', async () => {
    await expect(
      controller.exportPdf(req, 'it1', 'maybe', res() as never),
    ).rejects.toMatchObject({
      response: {
        message: 'Validation failed',
        errors: { inline: ['Inline must be true or false'] },
      },
    });
    expect(service.exportPdf).not.toHaveBeenCalled();
  });
});
