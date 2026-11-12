'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { parentHref } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Cancels the current form and returns to where the user came from (GEN-14).
 * Only this form's edits are dropped: the previous page keeps its URL and filters,
 * and the login session and other pages are untouched. If the form has unsaved
 * changes the user is asked first; if not, it leaves straight away.
 */
export function CancelButton({
  isDirty,
  fallbackHref,
  onCancel,
  label = 'Cancel',
}: {
  isDirty: boolean;
  /** Where to go if the form was opened directly (defaults to the parent section). */
  fallbackHref?: string;
  /** Extra clean-up for this form only (e.g. reset its local state). */
  onCancel?: () => void;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasInAppHistory } = useSession();
  const [asking, setAsking] = useState(false);
  useUnsavedChanges(isDirty);

  function leave() {
    setAsking(false);
    onCancel?.();
    if (hasInAppHistory) router.back();
    else router.push(fallbackHref ?? parentHref(pathname));
  }

  return (
    <>
      <button type="button" className="button button-ghost" onClick={() => (isDirty ? setAsking(true) : leave())}>
        {label}
      </button>
      <ConfirmDialog
        open={asking}
        title="Discard your changes?"
        message="The changes you made on this form will not be saved. Nothing else is affected."
        confirmLabel="Discard changes"
        destructive
        onConfirm={leave}
        onClose={() => setAsking(false)}
      />
    </>
  );
}
