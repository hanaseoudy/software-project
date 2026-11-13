import { statusLabel } from '@/lib/labels';

/** Shows a backend status as a coloured badge with plain words (e.g. PENDING_PAYMENT → "Awaiting payment"). */
export function StatusBadge({ status }: { status: string }) {
  const { label, tone, hint } = statusLabel(status);
  return (
    <span className={`badge badge-${tone}`} title={hint}>
      {label}
      {hint && <span className="visually-hidden">. {hint}</span>}
    </span>
  );
}
