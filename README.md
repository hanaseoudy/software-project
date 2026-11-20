# Travel Planning and Booking Platform

GIU Software Project I (Winter 2026). This web platform combines flight booking, hotel booking, itinerary planning, budgeting and a travel blog.

**Milestone 1 (backend and API), due 20/11:** a NestJS REST API on MongoDB Atlas, documented and demonstrated through Swagger UI. Every mandatory endpoint in section 8 of the project description is implemented. The Next.js frontend is Milestone 2 (11/12).

## Team

**Team name:** code red flag

- Hana Seoudy 16008495 (team leader)
- Nour Hossam 16006147
- Mariam Haithem 17006299
- Kenzy Sherif 17003702
- Seifeldin Karim 16009707
- Roaa Mahmoud 17006447
- Sara Gomaa 16002023
- Maya Haithem 16004517

## Tech stack

| Layer | Technology |
|---|---|
| Model | MongoDB Atlas with Mongoose schemas |
| Controller and services | NestJS (TypeScript), class-validator |
| View | Next.js (Milestone 2) |
| API docs | Swagger UI (`@nestjs/swagger`) |
| Payments | Stripe, test mode only |
| Auth | JWT in secure httpOnly cookies (no localStorage or sessionStorage) |

## Repository structure

```text
software-project/
├── backend/            NestJS API (all Milestone 1 code)
│   ├── src/            feature modules (see "API overview")
│   └── test/           end-to-end tests
├── docs/               requirements and documentation
├── .github/workflows/  CI: install, lint and build on pull requests
├── .env.example        environment variable template
├── AI_PROMPTS*.txt     AI usage logs (one per team member)
└── README.md
```

## Prerequisites

- **Node.js 24** (the version CI uses) and npm
- The team's shared MongoDB Atlas connection string (from the team leader)
- A Stripe account in **test mode**, for the `sk_test_...` key and the webhook secret
- A free **FXRatesAPI** key from [fxratesapi.com](https://fxratesapi.com) for budget currency conversion (ITN-18). This is **not** the same as FastForex or other exchange-rate services.

## Setup

### 1. Install dependencies

```bash
git clone https://github.com/hanaseoudy/software-project.git
cd software-project/backend
npm ci
```

### 2. Create the environment file

The backend reads `.env` from the folder you run it in, which is `backend/`. Copy the template there:

```bash
cp ../.env.example .env
```

Then fill in the values. `.env` is git-ignored, so never commit it.

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Shared MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Long random strings used to sign tokens (ACC-19) |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` | Token lifetimes (defaults: 900 and 1800) |
| `SESSION_IDLE_TIMEOUT_SECONDS` | Idle session timeout (default: 1800, i.e. 30 minutes) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` | The admin account created by the admin seed (ACC-18) |
| `STRIPE_SECRET_KEY` | Stripe **test** secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `FX_RATES_API_URL` | FXRatesAPI endpoint: `https://api.fxratesapi.com/latest` (ITN-18) |
| `FX_RATES_API_KEY` | Your FXRatesAPI key. **Required:** without it, `budget-summary?convert=preferred` returns 503. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional email notifications. Leave `SMTP_HOST` empty to use a free Ethereal test inbox; the links are printed in the server log. |
| `FRONTEND_URL` | Website address used in email links |
| `PORT` | Optional API port (default: 3000) |
| `UPLOADS_DIR` | Optional folder for uploaded images (default: `uploads`) |

### 3. Seed the database

Seeding is code, run once per database. Both scripts are safe to run again: they update existing records instead of duplicating them.

```bash
npm run seed:reference   # countries, currencies, cities, airports, attractions (GEN-12)
npm run seed:admin       # the admin account from the ADMIN_* variables (ACC-18)
```

- `seed:reference` loads the official reference datasets: 8 countries, 8 cities, 8 airports with their IANA time zones, and 8 attractions. The supported currencies come from the countries list. It also fixes airports stored in an older format.
- Admin accounts can only be created by this seed. There is no admin self-registration.
- Both scripts write to the database in `MONGODB_URI`, so check it points to the right database first.

### 4. Run the API

```bash
npm run start:dev    # development, restarts on changes
# or
npm run build && npm run start:prod
```

The API is served at `http://localhost:3000/api`.

The backend connects to the shared Atlas database on startup. If it can't connect, see [Troubleshooting](#troubleshooting).

## Using Swagger UI

Open **http://localhost:3000/api/docs**.

1. Call `POST /api/auth/register`, or log in with the seeded admin through `POST /api/auth/login`.
2. A successful login sets the `access_token` httpOnly cookie in the browser. Swagger then sends it automatically on protected routes, because it runs on the same origin.
3. Call `POST /api/auth/logout` to end the session.

To get a moderator account, log in as the admin and call `POST /api/admin/moderators`. Each moderator is linked to exactly one hotel or airline.

### Stripe payments in local development

Payments use Stripe test mode, and a booking is only confirmed after the payment is verified. To receive webhook events locally, use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

Put the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET`. Pay with Stripe's test cards, for example `4242 4242 4242 4242`.

## API overview

All routes are under `/api`. Each one is documented in Swagger with its requirement IDs.

| Module | Main routes | Requirements |
|---|---|---|
| Auth and users | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/change-password`, `/auth/me`, `/users/me` | ACC-01, ACC-04 to ACC-12, ACC-19 |
| Administration | `/admin/moderators`, `/admin/accounts`, `/admin/providers/:type/:id/...`, `/admin/bookings`, `/admin/reports`, `/admin/content`, `/admin/audit-logs` | ACC-07a, ACC-13 to ACC-18, GEN-07, GEN-10 |
| Airlines, airports and flights | `/airlines`, `/airports`, `/flights`, `/flights/search`, `/flights/:id` (edit), `/flights/:id/cabins`, `/flights/:id/cancel`, `/flights/:id/bookings`, `/flights/:id/passengers/export` (CSV) | FLT-01 to FLT-09, FLT-11 to FLT-17, FLT-29 |
| Flight bookings | `POST /flight-bookings` (also `/hold`), `GET /flight-bookings`, `/flight-bookings/:id`, `/summary`, `/confirmation`, `/e-ticket`, `/cancellation-quote`, `/cancel`, `/change-quote`, `/change`, `/seat` | FLT-19 to FLT-28 |
| Hotels and rooms | `/hotels`, `/hotels/search`, `/hotels/:id/rooms`, `/availability`, `/policies`, `/reservations` | HTL-01 to HTL-15, HTL-22 |
| Hotel bookings and reviews | `/hotel-bookings`, `/hotel-bookings/:id/cancel`, `/review`, `/reviews/:id` | HTL-16 to HTL-24 |
| Payments and refunds | `/bookings/:type/:id/policies`, `/accept-policies`, `/payments`, `/payments/webhook`, `/refunds/:id` | PAY-01 to PAY-04 |
| Itineraries | `/itineraries`, days, `/activities`, `/budgets`, `/transport-costs`, `/budget-summary` (`?convert=preferred` for currency conversion), `/public/search`, `/public/:id/clone`, `/hotels`, `/flights`, `/bookings`, `/pdf` | ITN-01 to ITN-28 |
| Blog | `/posts`, `/comments`, `/posts/:id/like`, `/tags/:tag/posts`, `/authors/:id` | BLG-01 to BLG-12 |
| Shared services | `/notifications` (list, unread count, mark read), `/reports`, `/uploads`, `/favourites` | GEN-01, GEN-08, GEN-09 |

Main behaviour:
- **Ownership:** users can only see their own bookings and private itineraries. Another user's item returns 404.
- **Concurrency:** flight seats and hotel rooms are held atomically for 10 minutes while payment is pending, and expired holds are released.
- **Validation:** errors are returned per field.
- **Pagination:** lists use 10 items per page.
- **Refunds:** user cancellations, hotel cancellations and airline flight cancellations all refund through the Stripe Refunds API (PAY-03). The refund status is shown on the booking details.
- **Endpoint names:** two endpoints use a slightly different path from the project description, which it allows. Day reordering (ITN-08) is `PATCH /itineraries/:id/days/:dayId/reorder`, and flight changes (FLT-27, optional) are `GET /flight-bookings/:id/change-quote` + `POST /flight-bookings/:id/change`.

## Tests

From `backend/`:

```bash
npm run lint
npm run build

npm test            # unit tests (the script already sets the ES-module flag Jest needs)

# End-to-end tests (need a local MongoDB replica set, not the shared Atlas database):
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:e2e
```

CI (`.github/workflows/backend-ci.yml`) runs install, lint and build on every pull request.

## Troubleshooting

| Error in the server log | Meaning | Fix |
|---|---|---|
| `getaddrinfo ENOTFOUND ...mongodb.net` | Your computer couldn't look up the Atlas address (internet or DNS problem). It often recovers by itself within seconds. | Check your internet. If it keeps happening, set Windows DNS to `8.8.8.8` / `1.1.1.1`, or turn off your VPN. |
| `connect ETIMEDOUT <ip>:27017` | Atlas was found but didn't answer. Usually your current IP isn't on the Atlas allow list, or your network blocks port 27017. | In Atlas: **Network Access → Add Current IP Address**. If it still fails, switch to a phone hotspot (some university and company networks block port 27017). |
| `bad auth` / `Authentication failed` | Wrong username or password in `MONGODB_URI` | Ask the team leader for the correct connection string. |
| `budget-summary?convert=preferred` returns 503 | No exchange rates available | Set `FX_RATES_API_KEY` (from fxratesapi.com) and restart. |
| Payments are disabled at startup | `STRIPE_SECRET_KEY` isn't a test key | Use a key that starts with `sk_test_`. |

## Git workflow

- `main` holds milestone releases and `develop` is the integration branch. Nobody commits directly to `main`.
- Each feature is built on a short-lived branch from the latest `develop`, named for example `feature/FLT-11-flight-search` or `fix/<requirement-id>-<description>`.
- Every pull request targets `develop`, references its requirement IDs and is reviewed by the team leader before merging.
- Commit messages follow Conventional Commits, for example `feat(flights): add round-trip search`.

## AI usage

Each team member logs AI prompts that materially contributed to the project in their own `AI_PROMPTS_<Name>.txt`, using the format from section 11 of the project description (date, student, tool, requirement, prompt, and how the output was used).
