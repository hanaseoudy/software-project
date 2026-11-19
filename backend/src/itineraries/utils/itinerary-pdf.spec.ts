import {
  buildItineraryPdf,
  endDateOf,
  pdfFilename,
  printable,
} from './itinerary-pdf';
import type { ItineraryPdfData } from './itinerary-pdf';

const day = (n: number, activities = 2) => ({
  dayNumber: n,
  date: `2027-02-${String(n).padStart(2, '0')}`,
  cityName: 'Cairo',
  notes: 'Bring water',
  activities: Array.from({ length: activities }, (_, i) => ({
    name: `Activity ${i + 1}`,
    description: 'A longer description of what happens during this activity.',
    time: `${String(8 + i).padStart(2, '0')}:00`,
    cost: 12.5,
    currency: 'USD',
  })),
});

const data = (
  days: ItineraryPdfData['days'] = [day(1), day(2)],
): ItineraryPdfData => ({
  title: 'Egypt in Winter',
  countryIds: ['EG'],
  startDate: '2027-02-01',
  days,
});

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page\n/g) ?? []).length;

describe('printable', () => {
  it('keeps Latin text and accents', () => {
    expect(printable('Café – “Nile”')).toBe('Café – “Nile”');
  });
  it('replaces characters the PDF font cannot draw', () => {
    expect(printable('رحلة to Cairo')).toBe('???? to Cairo');
  });
  it('handles missing values', () => {
    expect(printable(undefined)).toBe('');
    expect(printable(null)).toBe('');
  });
});

describe('pdfFilename', () => {
  it('makes a safe file name from the title', () => {
    expect(pdfFilename('Summer in Cairo!')).toBe(
      'itinerary-summer-in-cairo.pdf',
    );
  });
  it('never puts quotes, slashes or line breaks in the header', () => {
    expect(pdfFilename('a"b/../c\r\nd')).toBe('itinerary-a-b-cd.pdf');
  });
  it('falls back when nothing printable is left', () => {
    expect(pdfFilename('رحلة')).toBe('itinerary-trip.pdf');
  });
  it('keeps long titles short', () => {
    expect(pdfFilename('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('endDateOf', () => {
  it('is the last day of the trip', () => {
    expect(endDateOf('2027-02-27', 3)).toBe('2027-03-01');
    expect(endDateOf('2027-02-01', 1)).toBe('2027-02-01');
  });
});

describe('buildItineraryPdf', () => {
  it('returns a PDF document', async () => {
    const pdf = await buildItineraryPdf(data());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('works for an itinerary without days', async () => {
    const pdf = await buildItineraryPdf(data([]));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('works for days without activities or notes', async () => {
    const pdf = await buildItineraryPdf(
      data([{ ...day(1, 0), notes: undefined }]),
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('continues on more pages for a long itinerary', async () => {
    const days = Array.from({ length: 30 }, (_, i) => day(i + 1, 3));
    const pdf = await buildItineraryPdf(data(days));
    expect(pageCount(pdf)).toBeGreaterThan(2);
  });

  it('does not fail on text the font cannot draw', async () => {
    const pdf = await buildItineraryPdf({
      ...data(),
      title: 'رحلة مصر',
      days: [{ ...day(1), cityName: 'القاهرة', notes: '📝 ملاحظات' }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
