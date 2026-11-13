'use client';

import Link from 'next/link';
import { quickActionsFor } from '@/lib/navigation';
import { useSession } from '@/lib/session';

/** GEN-15: the main tasks for the current role as buttons; the first one is the primary action. */
export function QuickActions() {
  const { viewer, loading } = useSession();
  if (loading) return <div className="quick-actions" aria-hidden="true" />;
  const actions = quickActionsFor(viewer.audience);
  if (actions.length === 0) return null;

  return (
    <nav aria-label="Quick actions" className="quick-actions">
      {actions.map((action, i) => (
        <Link key={action.href} href={action.href} className={`button ${i === 0 ? 'button-primary' : 'button-ghost'}`}>
          {action.label}
        </Link>
      ))}
    </nav>
  );
}
