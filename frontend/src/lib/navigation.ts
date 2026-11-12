/**
 * GEN-14: one place that defines the site's information architecture.
 * The header menus, section overview pages and breadcrumbs are all built from this,
 * so menus stay consistent and every page has a known parent to go back to.
 *
 * Audiences come from the Actor(s) column of the requirements sheet.
 */
export type Audience = 'guest' | 'user' | 'airline' | 'hotel' | 'admin';

export interface NavItem {
  label: string;
  href: string;
  description: string;
  audiences: Audience[];
}

export interface NavGroup {
  id: string;
  label: string;
  /** Overview page that lists the group's items (also the breadcrumb parent). */
  href?: string;
  items: NavItem[];
}

const PUBLIC: Audience[] = ['guest', 'user'];
const USER: Audience[] = ['user'];
const SIGNED_IN: Audience[] = ['user', 'airline', 'hotel', 'admin'];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'explore',
    label: 'Explore',
    items: [
      { label: 'Flights', href: '/flights', description: 'Search one-way, round-trip and multi-city flights.', audiences: PUBLIC },
      { label: 'Hotels', href: '/hotels', description: 'Search hotels by city or country and dates.', audiences: PUBLIC },
      { label: 'Itineraries', href: '/itineraries', description: 'Browse public itineraries shared by travellers.', audiences: PUBLIC },
      { label: 'Blog', href: '/blog', description: 'Read and search travel posts.', audiences: PUBLIC },
    ],
  },
  {
    id: 'trips',
    label: 'My trips',
    href: '/account',
    items: [
      { label: 'My bookings', href: '/account/bookings', description: 'Flight bookings and hotel reservations: upcoming, past and cancelled.', audiences: USER },
      { label: 'My itineraries', href: '/account/itineraries', description: 'Plan days, activities and budgets.', audiences: USER },
      { label: 'My posts', href: '/account/posts', description: 'Your published posts and drafts.', audiences: USER },
    ],
  },
  {
    id: 'airline',
    label: 'Airline',
    href: '/airline',
    items: [
      { label: 'Airline profile', href: '/airline/profile', description: 'Edit your airline’s profile and policies.', audiences: ['airline'] },
      { label: 'Flights', href: '/airline/flights', description: 'Create and manage flights, cabins, baggage and bookings.', audiences: ['airline'] },
    ],
  },
  {
    id: 'hotel',
    label: 'Hotel',
    href: '/hotel',
    items: [
      { label: 'Hotel profile', href: '/hotel/profile', description: 'Edit your hotel’s profile, times and policies.', audiences: ['hotel'] },
      { label: 'Rooms', href: '/hotel/rooms', description: 'Add rooms, set availability and view room status.', audiences: ['hotel'] },
      { label: 'Reservations', href: '/hotel/reservations', description: 'View reservations for your hotel.', audiences: ['hotel'] },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    href: '/admin',
    items: [
      { label: 'Accounts', href: '/admin/accounts', description: 'View users and moderators, create moderators, suspend or reactivate.', audiences: ['admin'] },
      { label: 'Airlines & hotels', href: '/admin/providers', description: 'Create airline and hotel profiles.', audiences: ['admin'] },
      { label: 'Bookings', href: '/admin/bookings', description: 'Read-only list of all flight and hotel bookings.', audiences: ['admin'] },
      { label: 'Reports', href: '/admin/reports', description: 'Resolve reported content.', audiences: ['admin'] },
    ],
  },
];

/** Account menu (right side of the header). */
export const ACCOUNT_ITEMS: NavItem[] = [
  { label: 'Notifications', href: '/notifications', description: 'Booking, cancellation and refund updates.', audiences: SIGNED_IN },
  { label: 'Profile', href: '/account/profile', description: 'Name, phone number and preferred currency.', audiences: SIGNED_IN },
  { label: 'Change password', href: '/account/password', description: 'Change your password.', audiences: SIGNED_IN },
];

export const GUEST_ITEMS: NavItem[] = [
  { label: 'Log in', href: '/login', description: 'Log in to your account.', audiences: ['guest'] },
  { label: 'Register', href: '/register', description: 'Create a new account.', audiences: ['guest'] },
];

/** ACC-04: each role lands on its own home page. */
export const HOME_BY_AUDIENCE: Record<Audience, string> = {
  guest: '/',
  user: '/',
  airline: '/airline',
  hotel: '/hotel',
  admin: '/admin',
};

export function groupsFor(audience: Audience): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.audiences.includes(audience)) })).filter(
    (g) => g.items.length > 0,
  );
}

export interface RouteInfo {
  label: string;
  description: string;
  audiences: Audience[];
  /** Set when the route is a group overview page. */
  group?: NavGroup;
}

const ROUTES = new Map<string, RouteInfo>();
for (const group of NAV_GROUPS) {
  const audiences = [...new Set(group.items.flatMap((i) => i.audiences))];
  if (group.href) ROUTES.set(group.href, { label: group.label, description: '', audiences, group });
  for (const item of group.items) ROUTES.set(item.href, item);
}
for (const item of [...ACCOUNT_ITEMS, ...GUEST_ITEMS]) ROUTES.set(item.href, item);
// "/account" holds both "My trips" (users) and the account pages (everyone signed in).
ROUTES.set('/account', { ...ROUTES.get('/account')!, label: 'Account', audiences: SIGNED_IN });

export function routeInfo(path: string): RouteInfo | undefined {
  return ROUTES.get(path);
}

export function allRoutes(): string[] {
  return [...ROUTES.keys()];
}

/** True when `path` is `href` or a page below it (used to highlight the current menu). */
export function isActive(path: string, href: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Builds "Home › Section › Page" from the URL. Unknown segments (e.g. an id)
 * use `currentLabel` when they are the last part, and are skipped otherwise.
 */
export function breadcrumbsFor(path: string, currentLabel?: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];
  const parts = path.split('/').filter(Boolean);
  parts.forEach((_, index) => {
    const href = `/${parts.slice(0, index + 1).join('/')}`;
    const isLast = index === parts.length - 1;
    const label = isLast && currentLabel ? currentLabel : routeInfo(href)?.label;
    if (label) crumbs.push({ label, href });
  });
  return crumbs;
}

/** Where "Back" goes when there is no earlier page in this tab: the parent crumb. */
export function parentHref(path: string): string {
  const crumbs = breadcrumbsFor(path);
  const last = crumbs[crumbs.length - 1];
  if (last.href !== path) return last.href;
  return crumbs.length > 1 ? crumbs[crumbs.length - 2].href : '/';
}
