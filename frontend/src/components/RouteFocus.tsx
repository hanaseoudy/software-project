'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * After moving to another page, puts keyboard and screen-reader focus on the new
 * page's title, so users start at the content instead of tabbing through the menu again.
 * Waits briefly for the title in case the page is still showing its loading state.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const main = document.querySelector('main');
    if (!main) return;

    const focusTitle = () => {
      const heading = main.querySelector<HTMLElement>('h1');
      if (!heading) return false;
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      return true;
    };
    if (focusTitle()) return;

    const observer = new MutationObserver(() => {
      if (focusTitle()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = setTimeout(() => observer.disconnect(), 3000);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
