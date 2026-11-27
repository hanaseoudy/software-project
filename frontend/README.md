# Frontend (Next.js)

Milestone 2 frontend for the Travel Planning and Booking Platform: Next.js App Router, React, TypeScript, Tailwind CSS and Neobrutalism Components (shadcn/ui). Set up in FND-1 (TASK-133).

## Getting started

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local   # then adjust BACKEND_URL if needed
npm run dev                          # http://localhost:3001
```

Run the backend on port 3000 at the same time (`cd backend; npm run start:dev`). The backend's `FRONTEND_URL` default is already `http://localhost:3001`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3001 |
| `npm run build` | Production build (needs `BACKEND_URL`) |
| `npm run start` | Serves the production build on port 3001 |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |
| `npm test` | Jest + React Testing Library |

## Environment

| Variable | Where it is read | Example |
| --- | --- | --- |
| `BACKEND_URL` | Server only: the `/api` proxy in `next.config.ts` and `serverFetch` | `http://localhost:3000` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser: Stripe Elements in `<StripeCardForm />` (PAYC-1) | `pk_test_...` (test mode only) |

- `BACKEND_URL` is **required for every build** (CI, Vercel). Next.js evaluates the rewrites at build time, so a missing value fails the build instead of silently proxying to localhost. In `npm run dev` it falls back to `http://localhost:3000`.
- Never put secrets in `NEXT_PUBLIC_*` variables: they are sent to the browser. The only one is `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, a Stripe *publishable* key, which is public by design (the secret `sk_...` key stays in the backend).

## Folder structure

```text
src/
  app/                    routes (App Router); see "Route map"
    layout.tsx            root layout (the only layout for now)
    (public)/             pages for everyone (guests and logged-in users)
    (auth)/               login, register, forgot password
    (protected)/          pages that need a login (any role) + admin/, airline/, hotel/
      (user)/             pages for registered users only
    design-system/        GEN-17 preview page: palette, fonts, components, formatters
  components/ui/          Neobrutalism / shadcn components (button, card, input, label, badge)
  components/payments/    <StripeCardForm /> (PAYC-1): shared Stripe card payment form
  lib/
    api/
      client.ts           apiFetch: browser calls (client components)
      server.ts           serverFetch: Server Components, Route Handlers, Server Functions
      errors.ts           ApiError: one error shape for every failed call
      backend-url.ts      BACKEND_URL handling
      types.ts            Paginated<T> (GEN-05)
    format/
      money.ts            formatMoney (PAY-04)
      airport-time.ts     formatAirportDateTime / Time / Date (GEN-06)
    utils.ts              cn() for class names
  test-utils/             helpers for tests only (contrast.ts: contrastRatio for GEN-17 colour checks)
```

Tests live next to the code as `*.test.ts(x)`.

## Route map

Every page from the Milestone 2 page inventories already has its folder under `src/app/`, holding only an empty `.gitkeep`. A folder becomes a route when its task adds `page.tsx`.

**Rules for everyone:**
- **Build your page in the folder listed below.** Don't create another path, and don't rename or move folders. Agree route changes with the team leader first.
- Delete the folder's `.gitkeep` in the same PR that adds `page.tsx`.
- Don't add `layout.tsx`, route guards or role checks to the groups or the `admin/`, `airline/`, `hotel/` prefixes; that is FND-2.

### Route groups

Folders in brackets, like `(public)`, are [route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups). They organise pages by who may open them, but they are **not part of the URL**: `src/app/(public)/hotels/page.tsx` is served at `/hotels`.

| Group | Who can open it | Access rules (added by FND-2, not yet) |
| --- | --- | --- |
| `(public)` | Everyone: guests and logged-in users | none |
| `(auth)` | Guests (login, register, forgot password) | logged-in users are sent to their home page |
| `(protected)` | Any logged-in role | must be logged in; `admin/`, `airline/`, `hotel/` additionally need their role |
| `(protected)/(user)` | Registered users only | must be logged in with the User role |

- `/verify-email` and `/reset-password` are in `(public)`, not `(auth)`: people open them from an email link, possibly while still logged in.
- Some features are split across groups, because the browsing page is public and the booking or editing page needs a login. For example, `/hotels/[id]` is in `(public)`, and `/hotels/[id]/book` is in `(protected)/(user)`. Always check the exact folder below.

### Home and accounts (GEN, ACC)

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/` | `(public)/page.tsx (placeholder page)` |
| `/register` | `(auth)/register` |
| `/login` | `(auth)/login` |
| `/forgot-password` | `(auth)/forgot-password` |
| `/verify-email` | `(public)/verify-email` |
| `/reset-password` | `(public)/reset-password` |
| `/change-password` | `(protected)/change-password` |
| `/account` | `(protected)/account` |
| `/notifications` | `(protected)/notifications` |
| `/favourites` | `(protected)/(user)/favourites` |
| `/design-system` | `design-system (built in FND-1)` |

### Flights (FLT)

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/flights` | `(public)/flights` |
| `/flights/[id]` | `(public)/flights/[id]` |
| `/flights/book` | `(protected)/(user)/flights/book` |
| `/checkout/flight/[id]/summary` | `(protected)/(user)/checkout/flight/[id]/summary` |
| `/checkout/flight/[id]/pay` | `(protected)/(user)/checkout/flight/[id]/pay` |
| `/flight-bookings/[id]/confirmation` | `(protected)/(user)/flight-bookings/[id]/confirmation` |
| `/bookings/flights` | `(protected)/(user)/bookings/flights` |
| `/bookings/flights/[id]` | `(protected)/(user)/bookings/flights/[id]` |
| `/bookings/flights/[id]/change` | `(protected)/(user)/bookings/flights/[id]/change` |

### Hotels (HTL)

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/hotels` | `(public)/hotels` |
| `/hotels/[id]` | `(public)/hotels/[id]` |
| `/hotels/[id]/book` | `(protected)/(user)/hotels/[id]/book` |
| `/checkout/hotel/[id]/summary` | `(protected)/(user)/checkout/hotel/[id]/summary` |
| `/checkout/hotel/[id]/pay` | `(protected)/(user)/checkout/hotel/[id]/pay` |
| `/hotel-bookings/[id]/confirmation` | `(protected)/(user)/hotel-bookings/[id]/confirmation` |
| `/bookings/hotels` | `(protected)/(user)/bookings/hotels` |
| `/bookings/hotels/[id]` | `(protected)/(user)/bookings/hotels/[id]` |

### Itineraries (ITN)

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/itineraries` | `(protected)/(user)/itineraries` |
| `/itineraries/new` | `(protected)/(user)/itineraries/new` |
| `/itineraries/[id]` | `(protected)/(user)/itineraries/[id]` |
| `/itineraries/[id]/edit` | `(protected)/(user)/itineraries/[id]/edit` |
| `/itineraries/[id]/days/[dayId]` | `(protected)/(user)/itineraries/[id]/days/[dayId]` |
| `/itineraries/[id]/budget` | `(protected)/(user)/itineraries/[id]/budget` |
| `/itineraries/[id]/hotels` | `(protected)/(user)/itineraries/[id]/hotels` |
| `/itineraries/[id]/flights` | `(protected)/(user)/itineraries/[id]/flights` |
| `/explore` | `(public)/explore` |
| `/explore/[id]` | `(public)/explore/[id]` |

### Blog (BLG)

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/blog` | `(public)/blog` |
| `/blog/tags/[tag]` | `(public)/blog/tags/[tag]` |
| `/blog/[id]` | `(public)/blog/[id]` |
| `/authors/[id]` | `(public)/authors/[id]` |
| `/blog/new` | `(protected)/(user)/blog/new` |
| `/blog/mine` | `(protected)/(user)/blog/mine` |
| `/blog/[id]/edit` | `(protected)/(user)/blog/[id]/edit` |

### Airline moderator

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/airline` | `(protected)/airline` |
| `/airline/profile` | `(protected)/airline/profile` |
| `/airline/policies` | `(protected)/airline/policies` |
| `/airline/flights/new` | `(protected)/airline/flights/new` |
| `/airline/flights/[id]` | `(protected)/airline/flights/[id]` |
| `/airline/flights/[id]/bookings` | `(protected)/airline/flights/[id]/bookings` |

### Hotel moderator

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/hotel` | `(protected)/hotel` |
| `/hotel/profile` | `(protected)/hotel/profile` |
| `/hotel/policies` | `(protected)/hotel/policies` |
| `/hotel/rooms/new` | `(protected)/hotel/rooms/new` |
| `/hotel/rooms/[roomId]` | `(protected)/hotel/rooms/[roomId]` |
| `/hotel/reservations` | `(protected)/hotel/reservations` |
| `/hotel/reviews` | `(protected)/hotel/reviews` |

### Admin

| URL | Folder (under `src/app/`) |
| --- | --- |
| `/admin/system` | `(protected)/admin/system` |
| `/admin/system/accounts` | `(protected)/admin/system/accounts` |
| `/admin/system/moderators/new` | `(protected)/admin/system/moderators/new` |
| `/admin/system/providers` | `(protected)/admin/system/providers` |
| `/admin/system/bookings` | `(protected)/admin/system/bookings` |
| `/admin/system/airlines/new` | `(protected)/admin/system/airlines/new` |
| `/admin/system/hotels/new` | `(protected)/admin/system/hotels/new` |
| `/admin/system/reports` | `(protected)/admin/system/reports` |
| `/admin/system/audit-logs` | `(protected)/admin/system/audit-logs` |
| `/admin/system/analytics` | `(protected)/admin/system/analytics` |

### Error pages

`/404` and `/403` are Next.js special files at the root of `src/app/`, not folders: `not-found.tsx` and `forbidden.tsx`, added by their task.

### Dynamic segments

Use the names above (`[id]`, `[tag]`, `[dayId]`, `[roomId]`) and read them with `params.id` and so on. Folders that are siblings in the URL must share one name, also across groups: `(public)/hotels/[id]` and `(protected)/(user)/hotels/[id]` are both `[id]`. So never add e.g. `[hotelId]`.

## Design system (GEN-17)

Theme tokens are defined in `src/app/globals.css`; open **`/design-system`** to see them.

- Use the tokens (`bg-background`, `bg-main`, `bg-secondary-background`, `text-foreground`, `border-border`, `bg-olive`, `bg-mustard`, `bg-terracotta`, `shadow-shadow`, `rounded-base`) and never hardcode other colours.
- Fonts: `font-display` = Fraunces (headings, titles, branding; `h1`–`h6` use it automatically), `font-sans` = DM Sans (everything else, the default).
- In Neobrutalism, `font-base` and `font-heading` are font **weights**, not families.
- Buttons: `default` (Burgundy, primary), `secondary` (Olive Green border and shadow, Dark Brown text on Cream), `neutral` (Sage Green), `reverse`, `noShadow`.
- Contrast: text must be at least 4.5:1 against its background (`src/components/ui/contrast.test.ts` checks every button and badge variant). To test your own colours, use the shared helper instead of writing your own: `import { contrastRatio } from "@/test-utils/contrast"` then `expect(contrastRatio("foreground", "mustard")).toBeGreaterThanOrEqual(4.5)` (token names without `--`). No palette text colour passes on Olive Green (best: Cream 3.93), so use Olive for borders, shadows and decoration, not behind text. On Terracotta only Dark Brown passes (4.57); on Mustard use Dark Brown (7.00) or Burgundy (5.00).
- Add more Neobrutalism components with `npx shadcn@latest add https://neobrutalism.dev/r/<name>.json`, then replace any hardcoded `black`/`white` classes with theme tokens.

## Calling the backend

The browser never calls the backend directly. It calls `/api/*` on the frontend's own origin, and `next.config.ts` forwards it to `BACKEND_URL`. The backend's httpOnly, Secure, SameSite=Strict cookies are therefore first-party, so no CORS and no backend changes are needed (ACC-19). Uploaded images are served the same way (`/api/uploads/...`).

### In client components: `apiFetch`

```ts
import { apiFetch, ApiError, type Paginated } from "@/lib/api";

const hotels = await apiFetch<Paginated<Hotel>>("/hotels?page=1");
await apiFetch("/itineraries", { method: "POST", json: { title } });
await apiFetch(`/hotels/${id}/images`, { method: "POST", body: formData });

try {
  await apiFetch("/itineraries", { method: "POST", json: form });
} catch (error) {
  if (error instanceof ApiError) {
    error.status;       // 400
    error.message;      // "Validation failed"
    error.fieldErrors;  // { "days.0.city": ["city is required"] }  (GEN-02)
  }
}
```

- Paths are the Swagger paths, with or without `/api`. Absolute URLs are rejected.
- Cookies are always sent. Never store tokens in `localStorage`, `sessionStorage` or JS-readable cookies.
- **401 → refresh → retry:** on a 401, `apiFetch` calls `POST /api/auth/refresh` once and retries the request once. Parallel 401s share **one** refresh, because the backend rotates the refresh token and rejects a reused one (a second refresh would log the user out).
- If the refresh fails (ACC-06 idle expiry, logout elsewhere), it sends the user to `/login?reason=session-expired&returnTo=<current page>`. The login page should show a "Your session expired, please log in again" message for `reason=session-expired`.
- Public pages that only *check* for a session must pass `{ authRedirect: false }`, so guests aren't sent to `/login`.
- Network failures become `ApiError` with status `0`.

### In Server Components: `serverFetch`

```ts
import { serverFetch } from "@/lib/api/server";
import { isUnauthorized } from "@/lib/api";

const page = await serverFetch<Paginated<Hotel>>("/hotels?page=1");
```

`serverFetch` calls `BACKEND_URL` directly and forwards the incoming `access_token` cookie. It is **read-only** for the session: it never refreshes and never sets cookies, and it throws `ApiError` 401 when the session is missing or expired. Responses are not cached (`cache: "no-store"`) unless you pass a `cache` option.

### Errors in Server Components

**Catch `ApiError` where you call `serverFetch`, and never re-throw it from a Server Component.** In production, Next.js replaces any error thrown while a Server Component renders with a generic error that only has a `digest`. The `status` (401, 404…) is lost, so no error boundary can react to it, and the nearest error boundary replaces the whole page. (`next dev` shows the full error, so this only shows up in a production build.)

Who handles what:

| Where | On 401 (session expired) | On other errors |
| --- | --- | --- |
| **A page** (`page.tsx`), which loads the main data | Render FND-2's session recovery component | `notFound()` for 404, otherwise an error message |
| **A component inside a page** (e.g. a status badge) | Its own fallback, like any other error: "unavailable" note, or nothing | The same fallback |

A component inside a page never needs to handle the session: the page has already loaded its main data with `serverFetch`, so an expired session is caught there first. A 401 inside the component only happens if the session expires between the two calls, and a fallback is enough.

```tsx
// page.tsx
let booking: Booking;
try {
  booking = await serverFetch<Booking>(`/flight-bookings/${id}`);
} catch (error) {
  if (isUnauthorized(error)) return <SessionRecovery />;          // FND-2
  if (isApiError(error) && error.status === 404) notFound();
  return <p>We couldn't load this booking.</p>;
}

// a component inside the page
let refund: Refund;
try {
  refund = await serverFetch<Refund>(`/refunds/${refundId}`);
} catch {
  return <span>Refund status is unavailable right now.</span>;      // 401 included: no re-throw
}
```

## Session refresh on server-rendered pages (requirement for FND-2)

**Why the server cannot refresh:**
- The `refresh_token` cookie has path `/api/auth`, so the browser does **not** send it with page requests such as `/bookings`.
- The `access_token` cookie expires after 15 minutes (backend default), and then the browser deletes it.
- Next.js does not allow setting cookies while a Server Component renders.

So after 15 minutes a server-rendered page may see no session even though the user's refresh cookie is still valid.

**FND-2 (TASK-134) must therefore include a session recovery component:**
1. When a **page** (`page.tsx`) that needs a logged-in user gets `ApiError` 401 from its own `serverFetch` call (or finds no `access_token`), it renders the recovery component instead of the content. Components inside the page don't do this; they show their own fallback (see "Errors in Server Components").
2. The component (client) calls `refreshSession()` from `@/lib/api/client`. Because this is a browser request to `/api/auth/refresh`, the refresh cookie is sent.
3. On success it calls `router.refresh()`, so the page renders again with the new `access_token`.
4. On failure it sends the user to `/login?reason=session-expired&returnTo=<page>`.
5. Route guards must **not** redirect to `/login` just because `access_token` is missing: the refresh cookie may still be valid, and the server cannot see it.
6. Use the shared single refresh (`refreshSession`), never a separate `fetch`, so a page with several components doesn't refresh twice.
7. The recovery is rendered by the page, never triggered by re-throwing a 401: Next.js strips the status from errors thrown in Server Components in production.

## Upload size limits

The largest request the backend accepts is a hotel's 5 images × 5 MB (GEN-08) in one request, about 25 MB plus multipart overhead.

- **Local (`next dev` / `next start`):** Next.js buffers proxied request bodies and silently cuts them off at **10 MB** by default. `next.config.ts` raises this to 30 MB (`experimental.proxyClientMaxBodySize`). Tested locally on FND-1: 5 × 4.99 MB PNGs in one request through the proxy → 201, all 5 files stored byte-for-byte identical, and served back through `/api/uploads/...`.
- **Vercel: not verified yet.** On Vercel, external rewrites are handled by the platform rather than by a Function. Vercel Functions have a 4.5 MB body limit, and Vercel doesn't document a limit for external rewrites. **Verify on the first Vercel preview** (see the checklist below) before any upload page is merged.
- Never implement the proxy as a Route Handler (`app/api/[...path]/route.ts`): that runs as a Vercel Function and would hit the 4.5 MB limit.
- Keep `/api/*` out of the matcher of any future `proxy.ts` (formerly `middleware.ts`).

### First Vercel preview: upload check (to do after FND-1 is merged)

- [ ] Upload one ~5 MB JPG/PNG through the preview's `/api/...` (e.g. an activity image).
- [ ] Upload 5 × ~5 MB hotel images in one request as the hotel moderator.
- [ ] Check that the images open and have the full size.
- [ ] If a request fails with 413 or is cut off: stop and decide on the fallback (frontend and backend on one site, e.g. `app.<domain>` and `api.<domain>`, with uploads sent directly to the backend). That needs backend changes and the team leader's approval.
