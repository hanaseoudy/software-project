// PAY-01 endpoints used by <StripeCardForm /> (PAYC-1). Shapes follow the backend's
// PaymentResponseDto / PaymentSessionResponseDto (see Swagger, "Payments").
import { apiFetch } from "@/lib/api";

export type BookingType = "flight" | "hotel";

export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded";

export interface Payment {
  /** Same as the booking id (one payment per booking). */
  id: string;
  bookingType: BookingType;
  bookingId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  /** Only for a failed payment, read from Stripe by the backend. */
  failureReason?: string;
  expiresAt?: string;
  paidAt?: string;
}

export interface PaymentSession extends Payment {
  /** Passed to Stripe in the browser; card details never reach our backend. */
  clientSecret: string;
}

const startsInFlight = new Map<string, Promise<PaymentSession>>();

/**
 * POST /api/payments: starts paying for a Pending Payment booking.
 * Calls for the same booking made at the same time share one request (React runs
 * effects twice in development), because the backend answers a second, simultaneous
 * start with 409 "already being started".
 */
export function startPayment(bookingType: BookingType, bookingId: string): Promise<PaymentSession> {
  const key = `${bookingType}:${bookingId}`;
  let request = startsInFlight.get(key);
  if (!request) {
    request = apiFetch<PaymentSession>("/payments", { method: "POST", json: { bookingType, bookingId } }).finally(() =>
      startsInFlight.delete(key),
    );
    startsInFlight.set(key, request);
  }
  return request;
}

/** POST /api/payments/:id/retry: reopens a failed payment while the hold is active. */
export function retryPayment(paymentId: string): Promise<PaymentSession> {
  return apiFetch<PaymentSession>(`/payments/${encodeURIComponent(paymentId)}/retry`, { method: "POST" });
}

/** GET /api/payments/:id: the payment status as the backend sees it (set by the Stripe webhook). */
export function getPayment(paymentId: string): Promise<Payment> {
  return apiFetch<Payment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export interface WaitOptions {
  intervalMs: number;
  timeoutMs: number;
  /** Stops waiting (e.g. the component unmounted). */
  isCancelled?: () => boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Asks GET /api/payments/:id again and again until `isDone(payment)` is true.
 * Returns that payment, or null on timeout or cancel. A failed request (e.g. a
 * short network problem) is ignored and asked again; a 401/403/404 is thrown.
 */
export async function waitForPayment(
  paymentId: string,
  isDone: (payment: Payment) => boolean,
  { intervalMs, timeoutMs, isCancelled = () => false }: WaitOptions,
): Promise<Payment | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled()) return null;
    try {
      const payment = await getPayment(paymentId);
      if (isCancelled()) return null;
      if (isDone(payment)) return payment;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) throw error;
    }
    if (Date.now() + intervalMs > deadline) return null;
    await sleep(intervalMs);
  }
}
