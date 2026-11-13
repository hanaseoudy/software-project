/**
 * GEN-15: understandable labels. The backend sends codes like "PENDING_PAYMENT" or
 * "partially_refunded"; pages show these plain words instead. Values match the
 * backend enums (booking, flight, payment, refund, post and account statuses).
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface StatusLabel {
  label: string;
  tone: Tone;
  /** Short explanation shown as a tooltip / for screen readers. */
  hint?: string;
}

const STATUS_LABELS: Record<string, StatusLabel> = {
  // Flight bookings and hotel reservations (GEN-11)
  held: { label: 'Seats held', tone: 'info', hint: 'Seats are reserved while you finish booking.' },
  pending_payment: { label: 'Awaiting payment', tone: 'warning', hint: 'Pay before the hold expires to confirm.' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral', hint: 'The hold ended before payment was made.' },
  // Flights (FLT-30)
  scheduled: { label: 'Scheduled', tone: 'info' },
  departed: { label: 'Departed', tone: 'neutral' },
  // Payments and refunds (PAY-01, PAY-03)
  pending: { label: 'Processing', tone: 'warning' },
  succeeded: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'success' },
  partially_refunded: { label: 'Partly refunded', tone: 'success' },
  // Blog posts
  draft: { label: 'Draft', tone: 'neutral', hint: 'Only you can see this post.' },
  published: { label: 'Published', tone: 'success' },
  // Accounts
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'danger' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
  // Itinerary visibility (ITN-20)
  public: { label: 'Public', tone: 'info', hint: 'Anyone can find and view it.' },
  private: { label: 'Private', tone: 'neutral', hint: 'Only you can see it.' },
};

/** Turns any backend code into words: known codes use the table, others are tidied up. */
export function statusLabel(code: string): StatusLabel {
  const key = code.trim().toLowerCase();
  const known = STATUS_LABELS[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'neutral' };
}

const ROLE_LABELS: Record<string, string> = {
  guest: 'Guest',
  user: 'Traveller',
  admin: 'Admin',
  airline: 'Airline moderator',
  hotel: 'Hotel moderator',
};

export function roleLabel(audience: string): string {
  return ROLE_LABELS[audience] ?? audience;
}
