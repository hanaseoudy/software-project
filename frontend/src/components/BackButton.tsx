'use client';

import { usePathname, useRouter } from 'next/navigation';
import { parentHref } from '@/lib/navigation';
import { useSession } from '@/lib/session';

/**
 * Returns to the previous page. Browser history keeps that page's URL (search
 * filters, page number), so nothing the user entered there is lost. If the page
 * was opened directly, it goes to the parent section instead of leaving the site.
 */
export function BackButton({ fallbackHref, label = 'Back' }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasInAppHistory } = useSession();

  function goBack() {
    if (hasInAppHistory) router.back();
    else router.push(fallbackHref ?? parentHref(pathname));
  }

  return (
    <button type="button" className="button button-ghost back-button" onClick={goBack}>
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
