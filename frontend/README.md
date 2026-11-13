# Frontend (Next.js)

## Run

```bash
cp .env.example .env   # BACKEND_URL = where the NestJS backend runs
npm install
npm run dev            # http://localhost:3001
```

All `/api/*` requests are proxied to the backend, so the httpOnly auth cookies work (ACC-19).
For `npm run build` / `npm start`, set `BACKEND_URL` before building: the proxy address is fixed at build time.

With `npm run dev`, http://localhost:3001/ui-kit shows every shared component in action (hidden in production).

## Site structure (GEN-14)

- `src/lib/navigation.ts` is the site map. Menus, section pages and breadcrumbs are all built from it.
  Each entry lists which roles see it (guest, user, airline, hotel, admin, from the sheet's Actor(s) column).
- Until a feature page exists, its menu entry shows a placeholder page (`src/app/[...slug]`).
  To build a feature, create `src/app/<path>/page.tsx`. It replaces the placeholder automatically.

## Building a page

- Start every page with `<PageHeader title=… description=… showBack />`. It adds the breadcrumbs and Back button.
- Put form buttons in `<div className="form-actions">` with `<CancelButton isDirty={…} />` before the main
  action. Cancel asks before discarding unsaved changes and only drops that form's data.
- Use the spacing and colour variables in `src/app/globals.css` (`--space-*`, `--color-*`).
- Menus only hide pages. The backend still checks every permission (GEN-13).

## Clear and quick to use (GEN-15)

- **Actions:** `<Button>` — one `primary` (main action) per screen, `secondary` for the rest, `danger` only for
  destructive ones. Pass `busy` while saving: it shows e.g. "Saving…" and can't be pressed twice.
- **Labels:** wrap inputs in `<FormField label hint error>`. Every field gets a visible label, "(optional)" when
  not required, a hint and its error underneath (pass the backend's `errors[field]` array, GEN-02).
  After a failed submit call `focusFirstError(form)`.
- **Statuses:** `<StatusBadge status={booking.status} />` shows plain words ("Awaiting payment", not
  `PENDING_PAYMENT`). Use `formatMoney`, `formatDate`, `formatDateTime` (with the airport time zone) from `src/lib/format.ts`.
- **Fewer steps:** each role's main tasks are one click from the home page (`QUICK_ACTIONS` in `navigation.ts`).
  Menus work with the keyboard (↓ ↑ Home End Escape), and after each page change the cursor moves to the page title.

## Consistent visual design (GEN-17)

- **One design system:** every colour, font size, weight, spacing, radius, shadow, control height and layer is a
  CSS variable in the `:root` block of `src/app/globals.css`. Components use the *role* tokens
  (`--color-primary`, `--color-text`, `--color-danger`, …), not the raw palette. See them all at `/ui-kit` (dev).
- **Never type a raw value:** no `#hex`/`rgb()` colours, `font-size: 13px`, `border-radius: 6px`, `z-index: 999`,
  or inline styles. `npm run lint` runs `scripts/check-design-tokens.mjs`, which fails (also in CI) and lists the file
  and line. Need a new value? Add a token to `:root` first.
- **Use the shared classes:** `.button` (+ `button-primary` / `button-ghost` / `button-danger`), `.input` (inputs,
  selects, textareas), `.card`, `.table-wrap` + `.table`, `.badge`, `.row`, `.field-row`. All controls are one height
  (`--control-height`), share one corner radius and one keyboard focus outline, so rows line up.
- Put tables in `<div className="table-wrap">` and side-by-side inputs in `<div className="field-row">`; fields in a
  row keep their inputs level even when only some have a hint.
