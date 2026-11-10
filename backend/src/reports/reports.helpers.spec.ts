import {
  ALREADY_REPORTED_MESSAGE,
  isDuplicateKeyError,
  notAvailableMessage,
  paginate,
  skipFor,
  toReportResponse,
  UNAVAILABLE_REPORT_TYPES,
} from './reports.helpers';

// GEN-09: unit tests for the report helpers
describe('report helpers (GEN-09)', () => {
  it('recognises the MongoDB duplicate key error (unique index)', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isDuplicateKeyError(new Error('x'))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });

  it('uses the required 409 message', () => {
    expect(ALREADY_REPORTED_MESSAGE).toBe('You have already reported this item');
  });

  it('marks itinerary reports as not available yet', () => {
    expect(UNAVAILABLE_REPORT_TYPES).toEqual(['itinerary']);
    expect(notAvailableMessage('itinerary')).toBe('Reporting itinerary is not available yet');
  });

  it('paginates 10 per page', () => {
    expect(skipFor(1)).toBe(0);
    expect(skipFor(3)).toBe(20);
    expect(paginate(['a'], 21, 3)).toEqual({ items: ['a'], total: 21, page: 3, pageSize: 10, totalPages: 3 });
    expect(paginate([], 0, 1).totalPages).toBe(0);
  });

  it('maps a report document to the response', () => {
    const date = new Date('2026-11-10T00:00:00Z');
    expect(
      toReportResponse({
        _id: 'r1',
        reporter: 'u1',
        targetType: 'post',
        targetId: 'p1',
        reason: 'Offensive language',
        status: 'open',
        createdAt: date,
        updatedAt: date,
      }),
    ).toEqual({
      id: 'r1',
      reporter: 'u1',
      targetType: 'post',
      targetId: 'p1',
      reason: 'Offensive language',
      status: 'open',
      action: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: date,
      updatedAt: date,
    });
  });
});
