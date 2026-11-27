// PAYC-4 (PAY-03): loads a refund with GET /api/refunds/:id and shows its badge.
// Server Component, rendered with the booking details page (FLT-8, HTL-8):
//
//   <RefundStatus refundId={refundId} />
//
// - 404 (no such refund for this user): renders nothing.
// - Any other error, 401 included: a short "unavailable" note instead of breaking the page.
//   Never re-thrown (frontend/README.md, "Errors in Server Components"): the page has
//   already loaded the booking with serverFetch, so it handles an expired session itself.
// If the page already has the refund (e.g. `payment.refund`), use <RefundStatusBadge /> directly.

import { isApiError } from "@/lib/api";
import { serverFetch } from "@/lib/api/server";

import { RefundStatusBadge, type Refund } from "./refund-status-badge";

export function getRefund(refundId: string): Promise<Refund> {
  return serverFetch<Refund>(`/refunds/${encodeURIComponent(refundId)}`);
}

export async function RefundStatus({ refundId, className }: { refundId: string; className?: string }) {
  let refund: Refund;
  try {
    refund = await getRefund(refundId);
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    return <span className="text-sm">Refund status is unavailable right now.</span>;
  }
  return <RefundStatusBadge status={refund.status} amount={refund.amount} currency={refund.currency} className={className} />;
}
