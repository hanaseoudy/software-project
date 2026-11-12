'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { breadcrumbsFor } from '@/lib/navigation';

/** "Home › Section › Page", so users always see where they are and can jump up a level. */
export function Breadcrumbs({ currentLabel }: { currentLabel?: string }) {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname, currentLabel);
  if (crumbs.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href}>
              {last ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <Link href={crumb.href}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
