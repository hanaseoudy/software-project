# Frontend (Next.js)

## Run

```bash
cp .env.example .env   # BACKEND_URL = where the NestJS backend runs
npm install
npm run dev            # http://localhost:3001
```

All `/api/*` requests are proxied to the backend, so the httpOnly auth cookies work (ACC-19).

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
