// PAYC-4 (PAY-03): loads a refund with GET /api/refunds/:id and shows its badge.
// Server Component, rendered with the booking details page (FLT-8, HTL-8):
//
//   <RefundStatus refundId={refundId} />
//
// - 404 (no such refund for this user): renders nothing.
// - 401 (session expired): rethrown, so the page shows FND-2's session recovery
//   (see frontend/README.md, "Session refresh on server-rendered pages").
// - Any other problem: a short "unavailable" note instead of breaking the page.
// If the page already has the refund (e.g. `payment.refund`), use <RefundStatusBadge /> directly.

import { isApiError, isUnauthorized } from "@/lib/api";
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
    if (isUnauthorized(error)) throw error;
    if (isApiError(error) && error.status === 404) return null;
    return <span className="text-sm">Refund status is unavailable right now.</span>;
  }
  return <RefundStatusBadge status={refund.status} amount={refund.amount} currency={refund.currency} className={className} />;
}
