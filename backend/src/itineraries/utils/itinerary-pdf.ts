import PDFDocument from 'pdfkit';

/**
 * ITN-28: builds the printable PDF of an itinerary. Pure (no database or
 * framework code), so it can be unit tested on its own.
 */

export interface PdfActivity {
  name: string;
  description?: string;
  time?: string;
  cost?: number;
  currency?: string;
}

export interface PdfDay {
  dayNumber: number;
  date: string; // YYYY-MM-DD
  cityName: string;
  notes?: string;
  activities: PdfActivity[];
}

export interface ItineraryPdfData {
  title: string;
  countryIds: string[];
  startDate: string; // YYYY-MM-DD
  days: PdfDay[];
}

/**
 * The built-in PDF fonts only draw Latin-1 characters. Anything else (for
 * example Arabic) would come out as wrong glyphs, so it is shown as "?".
 */
export function printable(value: string | undefined | null): string {
  return (value ?? '')
    .replace(/[\r\t]+/g, ' ')
    .replace(/[^\n\x20-\x7E -ÿ–—‘’“”•…€]/g, '?')
    .trim();
}

/** "itinerary-summer-in-cairo.pdf": ASCII only, safe inside a header. */
export function pdfFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `itinerary-${slug || 'trip'}.pdf`;
}

/** The last day of the trip: start date + (days - 1). */
export function endDateOf(startDate: string, dayCount: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(dayCount, 1) - 1);
  return d.toISOString().slice(0, 10);
}

const money = (cost: number, currency?: string) =>
  `${(Math.round(cost * 100) / 100).toFixed(2)}${currency ? ` ${currency}` : ''}`;

export function buildItineraryPdf(data: ItineraryPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(22)
      .text(printable(data.title) || 'Itinerary', { align: 'center' });
    doc.moveDown(0.5);
    const dates = data.days.length
      ? `${data.startDate} to ${endDateOf(data.startDate, data.days.length)}`
      : `Starts ${data.startDate}`;
    doc
      .fontSize(11)
      .text(`${dates}   |   ${data.days.length} day(s)`, { align: 'center' });
    if (data.countryIds.length) {
      doc.text(`Countries: ${data.countryIds.map(printable).join(', ')}`, {
        align: 'center',
      });
    }

    if (!data.days.length) {
      doc.moveDown(2).fontSize(12).text('This itinerary has no days yet.', {
        align: 'center',
      });
    }

    for (const day of data.days) {
      // Keep a day heading together with at least its first lines.
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(1);
      doc
        .fontSize(14)
        .text(`Day ${day.dayNumber}: ${day.date} - ${printable(day.cityName)}`);
      const notes = printable(day.notes);
      if (notes) doc.moveDown(0.2).fontSize(10).text(`Notes: ${notes}`);

      if (!day.activities.length) {
        doc.moveDown(0.3).fontSize(10).text('No activities planned.');
        continue;
      }
      for (const a of day.activities) {
        const head = [
          a.time ? printable(a.time) : null,
          printable(a.name),
          a.cost !== undefined && a.cost !== null
            ? `(${money(a.cost, a.currency)})`
            : null,
        ]
          .filter(Boolean)
          .join('  ');
        doc.moveDown(0.3).fontSize(11).text(`• ${head}`, { indent: 8 });
        const description = printable(a.description);
        if (description) doc.fontSize(10).text(description, { indent: 22 });
      }
    }

    // Page numbers on every page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .text(`Page ${i + 1} of ${range.count}`, 50, doc.page.height - 40, {
          align: 'center',
          lineBreak: false,
        });
    }
    doc.end();
  });
}
