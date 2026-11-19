import { buildBookingSummary } from './booking-summary';
import { buildETicketPdf } from './e-ticket-pdf';

const airport = (iataCode: string, city: string) => ({
  iataCode,
  name: `${city} International`,
  city,
  timezone: 'UTC',
});

const flight = (flightNumber: string) => ({
  flightNumber,
  airlineName: 'EgyptAir',
  departureAirport: airport('CAI', 'Cairo'),
  arrivalAirport: airport('DXB', 'Dubai'),
  departureTime: new Date('2026-12-05T10:00:00Z'),
  arrivalTime: new Date('2026-12-05T13:00:00Z'),
  durationMinutes: 180,
});

const summary = buildBookingSummary(
  {
    id: 'b1',
    status: 'CONFIRMED',
    tripType: 'ROUND_TRIP',
    cabinClass: 'ECONOMY',
    currency: 'USD',
    totalPrice: 200,
    baggageFees: 20,
    passengers: [
      {
        firstName: 'Mariam',
        lastName: 'Mashoud',
        type: 'ADULT',
        dateOfBirth: new Date('2002-05-20'),
        documentType: 'PASSPORT',
        documentNumber: 'A12345678',
        baggage: [{ weightKg: 23, isExtra: false }],
      },
    ],
  } as never,
  flight('MS777') as never,
  flight('MS778') as never,
);

describe('buildETicketPdf', () => {
  it('returns a PDF document', async () => {
    const pdf = await buildETicketPdf(summary, 'FLT-ABCD2345');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
