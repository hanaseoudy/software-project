'use client';

import Link from 'next/link';
import { ACCOUNT_ITEMS, NAV_GROUPS, routeInfo, type NavItem } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { PageHeader } from './PageHeader';

export function SectionCards({ items }: { items: NavItem[] }) {
  return (
    <ul className="card-grid">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="card card-link">
            <h3>{item.label}</h3>
            <p className="muted">{item.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Generic page for a menu entry. Section overviews list their pages as cards;
 * other entries show their place in the site until the feature page replaces
 * this route (a real page.tsx at the same path takes priority automatically).
 */
export function SectionPage({ path }: { path: string }) {
  const { viewer, loading } = useSession();
  const info = routeInfo(path);
  if (!info) return null;

  if (!loading && !info.audiences.includes(viewer.audience)) {
    const guest = viewer.audience === 'guest';
    return (
      <>
        <PageHeader title={info.label} showBack />
        <div className="empty-state">
          <h2>{guest ? 'Please log in to continue' : 'This page is not available for your account'}</h2>
          <p className="muted">
            {guest
              ? 'You need an account to open this page.'
              : 'Use the menu above to find the pages for your role.'}
          </p>
          {guest && (
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="button button-primary">
              Log in
            </Link>
          )}
        </div>
      </>
    );
  }

  if (info.group || path === '/account') {
    const items =
      path === '/account'
        ? [...(NAV_GROUPS.find((g) => g.id === 'trips')?.items ?? []), ...ACCOUNT_ITEMS]
        : info.group!.items;
    const visible = items.filter((i) => i.audiences.includes(viewer.audience));
    return (
      <>
        <PageHeader title={info.label} description="Choose what you want to do." />
        <SectionCards items={visible} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={info.label} description={info.description} showBack />
      <div className="empty-state">
        <h2>Nothing here yet</h2>
        <p className="muted">This part of the platform is not available yet.</p>
      </div>
    </>
  );
}
