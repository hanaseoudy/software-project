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

## Feedback and error recovery (GEN-16)

- **Calling the backend:** use `apiFetch()` from `src/lib/api.ts`. It sends the cookies and throws an `ApiError`
  with a plain message ("We couldn't reach the server…", "Your session has ended…"), the GEN-02
  `fieldErrors`, and `retryable` when trying again can help.
- **Actions (save, book, delete):** `const save = useAction(fn, { success: 'Saved.' })`. Use `save.busy` on the
  `<Button busy>`, `save.fieldErrors[field]` on `<FormField error>` and `save.run(...)` to start. It shows a success
  message, or an error message with **Try again** for network/server errors, and ignores double clicks.
- **Messages:** `useToast()` → `success()`, `info()`, `error(message, { label: 'Try again', onClick })`.
  Success hides after 5 s; errors stay until closed.
- **Loading / failed loads:** `<LoadingState label="Loading bookings…" />` and `<ErrorState message onRetry />`.
  `src/app/loading.tsx` and `src/app/error.tsx` cover whole pages automatically (crash → "Something went wrong"
  with Try again). An offline banner appears when the connection drops.
- **Preventing input errors:** use the right input type (`email`, `date` with `min`, `number` with `min`/`max`),
  `maxLength` with `<FormField count={{ value, max }}>` for a live character counter, and check the form before sending.
- **Destructive actions** (GEN-03): `<ConfirmDialog destructive>` before deleting or cancelling.
- **Responsive:** layouts adapt at tablet (≤ 64rem) and phone (≤ 40rem) widths. Put tables in
  `<div className="table-wrap">` so they scroll inside their box, and side-by-side inputs in `<div className="field-row">`.
