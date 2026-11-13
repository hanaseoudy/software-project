'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ACCOUNT_ITEMS, GUEST_ITEMS, HOME_BY_AUDIENCE, groupsFor, isActive, type NavItem } from '@/lib/navigation';
import { useSession } from '@/lib/session';

function MenuLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link href={item.href} className="menu-link" aria-current={active ? 'page' : undefined}>
      {item.label}
    </Link>
  );
}

/**
 * A labelled dropdown. Opens on click, closes on Escape, outside click or navigation.
 * Keyboard (GEN-15): ↓ opens it and moves to the first link, ↑/↓ move between links,
 * Home/End jump to the first/last, Escape closes it and returns to the menu button.
 */
function Dropdown({
  id,
  label,
  active,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<'first' | null>(null);

  const links = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('.menu-link') ?? []);

  useEffect(() => {
    if (open && focusOnOpen.current === 'first') links()[0]?.focus();
    focusOnOpen.current = null;
  }, [open]);

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) links()[0]?.focus();
      else {
        focusOnOpen.current = 'first';
        onToggle();
      }
    }
  }

  function onPanelKey(e: React.KeyboardEvent) {
    const items = links();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (e.key in move) {
      e.preventDefault();
      items[move[e.key]]?.focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onToggle();
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="dropdown" data-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="menu-trigger"
        aria-expanded={open}
        aria-controls={`menu-${id}`}
        data-active={active || undefined}
        onClick={onToggle}
        onKeyDown={onTriggerKey}
      >
        {label}
        <span aria-hidden="true" className="chevron">
          ▾
        </span>
      </button>
      <div id={`menu-${id}`} ref={panelRef} className="dropdown-panel" hidden={!open} onKeyDown={onPanelKey}>
        {children}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { viewer, loading, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Close menus after navigating.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const toggle = (id: string) => setOpenMenu((cur) => (cur === id ? null : id));
  const groups = groupsFor(viewer.audience);
  const signedIn = viewer.audience !== 'guest';

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return (
    <header className="site-header">
      <div className="container header-row">
        <Link href={HOME_BY_AUDIENCE[viewer.audience]} className="brand">
          Travel Planner
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={mobileOpen}
          aria-controls="main-nav"
          onClick={() => setMobileOpen((v) => !v)}
        >
          Menu
        </button>

        <nav id="main-nav" ref={navRef} aria-label="Main" className="main-nav" data-open={mobileOpen || undefined}>
          <div className="nav-groups">
            {groups.map((group) =>
              group.id === 'explore' ? (
                // Explore is used most, so its links are shown directly instead of in a dropdown.
                <div key={group.id} className="nav-inline" role="group" aria-label={group.label}>
                  {group.items.map((item) => (
                    <MenuLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              ) : (
                <Dropdown
                  key={group.id}
                  id={group.id}
                  label={group.label}
                  active={group.items.some((i) => isActive(pathname, i.href))}
                  open={openMenu === group.id}
                  onToggle={() => toggle(group.id)}
                >
                  {group.href && group.id !== 'trips' && (
                    <Link href={group.href} className="menu-link menu-overview">
                      {group.label} overview
                    </Link>
                  )}
                  {group.items.map((item) => (
                    <MenuLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </Dropdown>
              ),
            )}
          </div>

          <div className="nav-account" aria-busy={loading || undefined}>
            {loading ? null : signedIn ? (
              <Dropdown
                id="account"
                label={viewer.name ?? 'Account'}
                active={ACCOUNT_ITEMS.some((i) => isActive(pathname, i.href))}
                open={openMenu === 'account'}
                onToggle={() => toggle('account')}
              >
                {ACCOUNT_ITEMS.map((item) => (
                  <MenuLink key={item.href} item={item} pathname={pathname} />
                ))}
                <button type="button" className="menu-link menu-logout" onClick={handleLogout}>
                  Log out
                </button>
              </Dropdown>
            ) : (
              GUEST_ITEMS.map((item, i) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={i === GUEST_ITEMS.length - 1 ? 'button button-primary' : 'menu-link'}
                  aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
