import PDFDocument from 'pdfkit';
import type { buildBookingSummary } from './booking-summary';

type BookingSummary = ReturnType<typeof buildBookingSummary>;

const dateTime = (value: Date | string, timezone?: string) => {
  const d = new Date(value);
  try {
    return d.toLocaleString('en-GB', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return d.toISOString();
  }
};

/**
 * FLT-23: downloadable e-ticket (PDF) for a confirmed flight booking: booking
 * reference, every flight, every passenger and the total paid.
 */
export function buildETicketPdf(
  summary: BookingSummary,
  bookingReference: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).text('E-Ticket', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .text(`Booking reference: ${bookingReference}`, { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .text(
        `Status: ${summary.status}   |   Trip: ${summary.tripType.replace('_', ' ')}   |   Cabin: ${summary.cabinClass.replace('_', ' ')}`,
      );

    doc.moveDown().fontSize(14).text('Flights');
    for (const f of summary.flights) {
      doc
        .moveDown(0.3)
        .fontSize(11)
        .text(`${f.segment}: ${f.airlineName} ${f.flightNumber}`);
      doc
        .fontSize(10)
        .text(
          `${f.departureAirport.city} (${f.departureAirport.iataCode}) ${dateTime(f.departureTime, f.departureAirport.timezone)}`,
        )
        .text(
          `${f.arrivalAirport.city} (${f.arrivalAirport.iataCode}) ${dateTime(f.arrivalTime, f.arrivalAirport.timezone)}`,
        )
        .text(
          `Duration: ${Math.floor(f.durationMinutes / 60)}h ${f.durationMinutes % 60}m`,
        );
    }

    doc.moveDown().fontSize(14).text('Passengers');
    summary.passengers.forEach((p, i) => {
      doc
        .moveDown(0.3)
        .fontSize(11)
        .text(`${i + 1}. ${p.firstName} ${p.lastName} (${p.type})`);
      doc
        .fontSize(10)
        .text(
          `${p.documentType} ${p.documentNumber}   |   Date of birth: ${p.dateOfBirth}`,
        )
        .text(
          `Bags: ${p.baggage.length}${p.extraBags > 0 ? ` (${p.extraBags} extra)` : ''}`,
        );
    });

    doc.moveDown().fontSize(14).text('Payment');
    doc
      .moveDown(0.3)
      .fontSize(10)
      .text(
        `Seat fares: ${summary.pricing.fareTotal.toFixed(2)} ${summary.pricing.currency}`,
      )
      .text(
        `Baggage fees: ${summary.pricing.baggageFees.toFixed(2)} ${summary.pricing.currency}`,
      )
      .fontSize(11)
      .text(
        `Total paid: ${summary.pricing.total.toFixed(2)} ${summary.pricing.currency}`,
      );

    doc.end();
  });
}
