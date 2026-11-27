// PAYC-4 (PAY-03): refund status badge with the amount, e.g. "Refunded · USD 60.25".
// Uses the shared GEN-17 <Badge>. No hooks or event handlers: it is rendered on the server
// with the page, and can also be used inside client components (e.g. with the `refund`
// returned by GET /api/payments/:id).

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** PAY-03 refund states (backend RefundStatus). */
export type RefundStatusValue = "pending" | "refunded" | "failed";

/** GET /api/refunds/:id (backend RefundResponseDto). */
export interface Refund {
  id: string;
  paymentId: string;
  bookingType: "flight" | "hotel";
  bookingId: string;
  /** In major units, e.g. 60.25 (PAY-04: USD). */
  amount: number;
  currency: string;
  status: RefundStatusValue;
  reason?: string;
  appliedPolicy?: Record<string, unknown>;
  processedAt?: string;
}

// GEN-17 colours (text contrast >= 4.5:1): Dark Brown on Mustard 7.00, Dark Brown on
// Sage (the neutral badge), Cream on Burgundy (the primary button).
const STYLES: Record<RefundStatusValue, { label: string; className: string }> = {
  pending: { label: "Refund pending", className: "bg-mustard text-foreground" },
  refunded: { label: "Refunded", className: "bg-secondary-background text-foreground" },
  failed: { label: "Refund failed", className: "bg-main text-main-foreground" },
};

export interface RefundStatusBadgeProps {
  status: RefundStatusValue;
  amount: number;
  /** Defaults to the platform currency (USD). */
  currency?: string;
  className?: string;
}

export function RefundStatusBadge({ status, amount, currency, className }: RefundStatusBadgeProps) {
  const style = STYLES[status] ?? STYLES.pending;
  const money = formatMoney(amount, currency);
  return (
    <Badge data-status={status} className={cn("text-sm font-heading", style.className, className)}>
      {style.label}
      <span aria-hidden="true">·</span>
      {money}
    </Badge>
  );
}
