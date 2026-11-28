# CLAUDE.md — Repository Instructions for Claude Code

Read this entire file before making changes. These instructions apply to every task in this repository. When a request conflicts with this file, the official requirements or the project PDF, explain the conflict and ask before changing behavior.

## 1. Project and delivery context

**GIU Software Project I (Winter 2026): Travel Planning and Booking Platform** — flight and hotel bookings, itinerary planning and budgets.

- **Backend:** NestJS, TypeScript, MongoDB Atlas, Mongoose; one shared Atlas database for the team.
- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS + shadcn/ui with Neobrutalism Components (GEN-17); developed in Milestone 2 in `frontend/`.
- **Architecture:** feature-based MVC. Controllers handle HTTP; services implement business logic and database access; Mongoose schemas define persistence.
- **Roles:** Guest, Registered User, Admin, Airline Moderator, Hotel Moderator, System.
- **Milestone 1:** backend and Swagger, 20 November 2026.
- **Milestone 2:** frontend and integration, 11 December 2026.
- **Environment:** Windows PowerShell. Use PowerShell-compatible commands.

### Repository layout

```text
software-project/
  .github/            # CI workflows and the PR template
  backend/
    src/
      auth/ users/ admin/ airlines/ flights/ flight-bookings/
      hotels/ hotel-bookings/ payments/ itineraries/
      reports/ uploads/ notifications/ audit-logs/ exchange-rates/
      reference-data/ common/
      main.ts app.module.ts
    test/             # e2e tests (*.e2e-spec.ts) and setup-e2e.ts
  frontend/           # Next.js app; structure and route map in frontend/README.md
    src/app/          # routes in route groups: (public)/ (auth)/ (protected)/ (protected)/(user)/
    src/components/   # shared components: ui/ feedback/ reference-data/ payments/
    src/lib/          # api/ (apiFetch, serverFetch) and format/ (money, airport times)
    src/test-utils/   # helpers for tests only
  docs/
    requirments/      # Folder name is intentionally spelled this way
    PR-REVIEW-PROCESS.md
    postman/ api/
  AI_PROMPTS.txt      # shared AI log; personal logs: AI_PROMPTS_<Name>.txt, HANA_AI_PROMPTS.txt
  CLAUDE.md AGENTS.md # AI instructions; AGENTS.md points here
  README.md
  .env.example
```

Modules usually contain `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` and `schemas/`. Inspect actual paths rather than assuming every module is identical.

### Common commands

From `backend/`:

```powershell
npm install
npm run start:dev
npm run lint            # oxlint
npm run build           # nest build; also the TypeScript type-check
npm test                # unit tests (*.spec.ts next to the code)
npm run test:e2e        # e2e tests; needs a disposable local MongoDB, see section 7
```

From `frontend/` (copy `.env.example` to `.env.local` first; it sets `BACKEND_URL`):

```powershell
npm install
npm run dev             # http://localhost:3001 (the backend stays on 3000)
npm run lint
npx tsc --noEmit        # type-check
npm run build
npm test                # Jest + React Testing Library (*.test.ts(x) next to the code)
```

Swagger UI: `http://localhost:3000/api/docs` (when the server is running on port 3000).

**Test status (verified 26 November 2026):** the old Jest ES-module problem is fixed. All unit tests and all e2e tests pass on `develop` and in CI. A failing test now means a real problem: investigate it, don't assume it is a known blocker. One e2e test (ITN-07/ITN-20 quorum) starts its own MongoDB and occasionally fails to start in CI with `Connection refused`; re-run the failed job once before investigating.

## 2. Source-of-truth hierarchy

Before implementing **any** requirement:

1. Read the **official requirements sheet** in `docs/requirments/`: `Final_ SP1_Reviewed_Requirements.xlsx` and/or its Mandatory CSV. Find the exact requirement ID, full text, actors, rules, limits, error cases and declared dependencies.
2. Read `docs/requirments/software project.pdf`, especially section 5 (entities), section 6 (functional scope), section 8 (required endpoints, paths and methods), and section 10 (Git workflow).
3. Inspect the relevant existing code, DTOs, schemas, controllers, services, tests and shared utilities. Treat existing code/tests as evidence of current behavior, **not** as authority over the documents.
4. Apply the following precedence for *business requirements*: **official requirements sheet > project PDF > explicitly agreed task scope > existing implementation/tests**. If sources disagree, tell the user what differs before making a behavior-changing decision.
5. Identify declared dependencies. Do not implement, rewrite or silently expand a dependency requirement unless the task explicitly includes it or the user approves the necessary change.
6. Before editing, briefly report the requirement ID(s), the key acceptance rules, the intended files, and any ambiguity or conflict. If the actual requirement cannot be located, stop and ask; do not invent it.

**No invented business rules.** Do not invent endpoints, status codes, limits, actors, fields or workflow constraints absent from the authoritative documents. If an implementation detail is necessary but unspecified, explain the proposal and get approval when it affects public API or behavior. Extra endpoints require clear justification and Swagger documentation.

## 3. Non-negotiable safety rules

1. **Secrets:** Never open, read, print, edit, commit or push `backend/.env` or other real secret files. Never expose credentials, access tokens, private keys, passwords, connection strings or cookies in output, logs, examples, prompts, screenshots or PR text. Do not inspect `.env` to debug; request sanitized nonsecret configuration details if needed.
2. **Templates:** `.env` files must remain ignored. `.env.example` may contain variable names and clearly nonsecret placeholders, but never real credentials. Do not change environment files without explicit authorization.
3. **Git:** Never commit or push directly to `main` or `develop`. Use a feature/fix/docs branch and open a PR into `develop`. The team leader reviews and merges; never merge your own PR.
4. **Existing work:** Always inspect `git status` before editing or committing. Preserve all staged, unstaged and untracked changes. Never use `git reset --hard`, `git clean`, force-push, rebase shared history, delete branches, or overwrite another person's work without explicit permission.
5. **Branch control:** If already on a task branch, remain there unless explicitly asked to switch or create a branch. Never switch branches with uncommitted work without asking and establishing a safe preservation plan.
6. **Scope:** Make the smallest change that satisfies the approved requirement. Avoid unrelated refactors, formatting churn and edits to other people's modules. Never commit `dist/`, `node_modules/`, generated artifacts or unrelated files.
7. **Shared configuration:** Ask first before changing `jest.config`, `package.json` scripts/dependencies, CI workflows, `main.ts`, global guards, middleware, shared schemas or other cross-module configuration.
8. **Security:** Enforce authentication, authorization, ownership, validation and concurrency in the backend, regardless of frontend checks.
9. **Database:** Treat the shared Atlas database as real team data. Do not wipe, reseed, migrate, backfill, bulk edit or run destructive operations without explicit approval. Prefer mocks or isolated test data.
10. **No silent fixes:** Do not silently resolve merge conflicts, alter another feature's semantics, weaken validation or change established API contracts. Surface the issue and ask.

## 4. Git workflow

### Starting a new task

Only when the user requests a **new branch** and the working tree is safe:

```powershell
git status
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/<REQ-ID>-TASK-<n>-<description>
```

Use the latest `develop` as the base for new branches. If local changes, divergent history, missing refs, or conflicts prevent this, **stop and ask** rather than discarding or stashing work automatically.

The Jira key (`TASK-<n>`) must be in the branch name. Jira uses it to link the branch and PR to the task, and CI fails PRs without it (`chore/` and `docs/` branches are exempt).

Naming examples:

- `feature/ITN-21-TASK-89-public-search`
- `fix/ITN-20-public-visibility`
- `docs/ai-prompt-log`
- `refactor/<description>`

Use Conventional Commits with the requirement ID, e.g. `feat(itineraries): add public search filters ITN-21`. PRs target `develop`, explain the requirement IDs, changed behavior, verification and known limitations, and include only task-related files. Do not open, push or merge a PR unless requested.

### Pull requests and CI

- **One Jira task = one branch = one PR.** Keep PRs small; CI warns above about 800 changed lines.
- PR title format: `TASK-<n> [<planning ID>] <short description>`, e.g. `TASK-160 [FLT-1] Flight search page`.
- Fill in every section of `.github/pull_request_template.md`: Jira task, requirement IDs, what changed, endpoints, testing, the checklist and known limitations. See `docs/PR-REVIEW-PROCESS.md`.
- **Screenshots (optional, non-blocking):** for frontend changes, add desktop and mobile (~375 px) screenshots of the states you built when you can. They help the reviewer but are a reminder, not a requirement: a PR is reviewed and can be merged without them.
- Required CI checks on every PR into `develop`/`main` (all must be green before merge):
  - `Backend lint, build and unit tests`
  - `Backend e2e tests`
  - `Frontend lint, type-check and build`
  - `Jira task link and PR size`
- Run the same commands locally before pushing. Never weaken a test, skip a check or edit a workflow to make CI pass.
- **Automatic Claude review** (`Claude Code Review` workflow, not a required check): every non-draft PR gets inline comments on actionable problems: missing requirement rules, incorrect behaviour, API calls that don't match the backend, frontend-quality issues and weak or missing tests. Each comment says whether it was verified by reading the code or needs runtime or manual testing. Read every comment; fix real problems or reply explaining why not. Write `@claude <question>` in a PR comment to ask it something. It never approves, pushes or merges. PRs with a merge conflict are not reviewed (GitHub runs no PR workflows on them): merge `develop` first.
- **Only the team leader (`@hanaseoudy`) reviews, approves and merges.** There are no peer reviewers and no CODEOWNERS. Never merge a PR, and never approve one on someone's behalf.
- `develop` is the repository's default branch; `main` receives only milestone releases from `develop`.

To bring updates from `develop` into a task branch, use `git fetch origin` and, after checking status and obtaining approval when necessary, `git merge origin/develop`. Report conflicts; do not resolve them silently.

### Before every commit

- Run `git status` and inspect the diff (`git diff`, `git diff --cached`).
- Stage **only** relevant named files, not blindly `git add .`.
- Verify that no secret files or unrelated modifications are staged.
- Do not commit, push, rename branches or create a PR unless the user asks.

## 5. Implementation conventions

### APIs and structure

- Global API prefix: `/api`, configured in `main.ts`.
- Follow existing feature modules; reuse shared guards, validation, pagination, upload and response-mapping utilities.
- Controllers handle HTTP/decorators and call services; services own business logic and persistence; DTOs validate input; schemas enforce persistence constraints.
- Return explicit response DTOs/mappers, not raw Mongoose documents. Avoid leaking private fields.
- Declare specific routes (e.g. `/itineraries/public/search`) **before** parameter routes (e.g. `/itineraries/:id`).

### Validation and errors

- Use class-validator DTOs on all external inputs. The global `ValidationPipe` uses `whitelist: true` and `transform: true`, plus a custom exception factory.
- Validation responses follow `{ "message": "Validation failed", "errors": { "field": ["message"] } }`, with nested paths such as `days.0.city`.
- Enforce stated constraints in the DTO and, where applicable, the Mongoose schema.
- Map expected database failures to Nest exceptions, including duplicate key `11000` to `ConflictException`.
- Use the **official requirement's** specified status codes when available. Otherwise follow the existing API convention consistently: unauthenticated `401`, forbidden actions `403`, nonexistent resources `404`, invalid input `400`, conflicts `409`. Do not invent special ownership error semantics without checking the actual task requirements.

### Authentication and authorization

- JWT authentication uses **httpOnly cookies**, not `localStorage` or `sessionStorage`.
- Protect private routes with `@UseGuards(JwtAuthGuard)` from `src/common/guards/jwt-auth.guard.ts`.
- Obtain identity from verified `req.user` (existing shapes may use `userId`, `id`, `_id` or `sub`); never trust a user ID from the body or query.
- Scope all user-owned reads and writes to the authenticated user, and check roles where applicable.

### Pagination (GEN-05)

Every paginated list uses **a fixed page size of 10**. Accept `page`, not `limit`, unless an authoritative requirement explicitly overrides this rule. Return:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 10, "totalPages": 0 }
```

### Swagger

Every endpoint requires `@ApiTags`, `@ApiOperation` (summary and description), relevant `@ApiParam`/`@ApiQuery` documentation, and `@ApiResponse` for expected successes and errors. Swagger is part of Milestone 1 acceptance.

### Uploads (GEN-08)

JPG/PNG only; maximum **5 MB per file** where required by GEN-08. Reuse `uploads/` for storage and URL handling; store references on the owning entity. Consult the official requirement for entity-specific image-count limits.

### Concurrency and persistence

Booking and inventory changes must remain safe under concurrent requests (atomic updates, transactions where appropriate, and unique indexes). Do not introduce read-then-write races or weaken existing invariants.

## 6. Frontend conventions (Milestone 2)

These rules apply to every page in `frontend/`. Shared components are built in their own Jira tasks (FND-*, PAYC-*), by whoever is assigned to them, before the pages that use them; feature pages reuse them.

### Design system (GEN-17), mandatory

- **Components:** Neobrutalism Components, built on Tailwind CSS and shadcn/ui. Use the shared theme and components; don't add another UI library, CSS framework or component kit.
- **Look:** soft, retro-inspired: earthy pastel colours, bold typography, rounded components, dark borders and offset shadows.
- **Colour palette.** Use only these colours, through the theme tokens; never hardcode other hex values:

  | Colour | Hex | Used for |
  | --- | --- | --- |
  | Cream | `#F5EFDC` | Main background |
  | Burgundy | `#63383C` | Primary buttons and headings |
  | Sage Green | `#A8B79A` | Secondary backgrounds and components |
  | Olive Green | `#697D50` | Secondary-button borders and shadows, accents (never behind text, see contrast) |
  | Terracotta | `#C48772` | Decorative elements and accents |
  | Mustard Yellow | `#D9B65D` | Highlights |
  | Dark Brown | `#352C28` | Text, borders and shadows |

- **Fonts:** **Fraunces** for headings, page titles and branding; **DM Sans** for body text, buttons, forms, tables and navigation. No other fonts.
- **Contrast:** text needs at least **4.5:1** against its background (WCAG AA); borders and other UI parts at least 3:1. No palette text colour passes on Olive Green, so never put text on Olive. Test colours with the shared helper `contrastRatio` from `@/test-utils/contrast`; don't write your own.
- **Responsive (GEN-16):** every page works on desktop, tablet and mobile (check about 375 px wide).
- Theme tokens, button variants and the `/design-system` preview page: see `frontend/README.md`, "Design system".

### Reuse the shared foundation; never duplicate it

`frontend/README.md` is the detailed, up-to-date guide to the frontend foundation (folder structure, route map, backend calls, errors, uploads). Read the relevant section before building a page. Before building anything, check whether a shared piece already exists, and use it:

- **Backend calls:** `apiFetch` (client components) and `serverFetch` (Server Components) from `@/lib/api`, with `ApiError`, `isApiError`, `isUnauthorized` and `Paginated<T>`. Never call `fetch` on the backend directly.
- **Formatting:** `formatMoney` (PAY-04: `USD 640.00`, never converted) and `formatAirportDateTime` / `formatAirportTime` / `formatAirportDate` (GEN-06) from `@/lib/format`.
- **Components:** `@/components/ui` (Neobrutalism), `@/components/feedback` (Spinner, LoadingState, ErrorState, toasts), `@/components/reference-data` (airport, country, city and currency pickers), `@/components/payments` (Stripe card form, hold countdown, policy acceptance, refund status).
- **Still to come in their own tasks** (use them once merged; until then, stop and ask rather than writing your own): the auth context / current user (`GET /api/auth/me`), route guards and session recovery (FND-2), the layout and navbar per role, the notification bell, form field + backend error display, confirm dialog, empty state, pagination, image upload, the booking status badge, and the report / admin content actions.

Anyone can build a shared component when it is their assigned task. Build it to be reusable: typed props, no page-specific logic, and a short usage example in the PR.

If a shared piece you need is missing or doesn't fit, **stop and ask** rather than writing a page-specific copy. To change a shared component that someone else built, agree it with its author or the team leader first, because other pages depend on it.

### Rules

- **Auth:** the backend uses httpOnly cookies. Never store tokens in `localStorage`, `sessionStorage` or JS-readable cookies. In the browser, `apiFetch` sends cookies (`credentials: 'include'`) and handles 401 → one shared refresh → retry → `/login?reason=session-expired`. `serverFetch` never refreshes: on an expired session it throws `ApiError` 401.
- **Errors in Server Components:** catch `ApiError` where you call `serverFetch` and **never re-throw it** (in production Next.js replaces it with a generic error and the status is lost). A page renders the session recovery component on 401; a component inside a page shows its own fallback for every error, 401 included. Details: `frontend/README.md`, "Errors in Server Components".
- **Backend URL:** the browser calls relative paths (`/api/...`), which `next.config.ts` proxies to the server-only `BACKEND_URL`; no CORS is needed. Never hardcode `localhost` or the backend address in code. Never put secrets in `NEXT_PUBLIC_*` variables, because they are sent to the browser.
- **Routes:** every planned URL already has a folder in its route group (`(public)`, `(auth)`, `(protected)`, `(protected)/(user)`); see the route map in `frontend/README.md`. Build a page in its existing folder. Route groups don't change URLs. If you add or move a route, update the route map in the same PR.
- **Backend is the authority (GEN-13):** frontend validation and route guards are UX only. Don't skip backend validation, and don't rely on hidden buttons for security.
- **Use the API as documented in Swagger.** Don't invent endpoints, fields, query parameters or status codes. If a page needs something the API doesn't provide, stop and ask; changing the backend is a separate, approved task.
- **Validation errors (GEN-02):** show the backend's `{ message, errors: { field: [...] } }` next to each field, including nested paths such as `days.0.city`.
- **Pagination (GEN-05):** lists use the shared pagination with `?page=` (fixed page size 10) and the `{ items, total, page, pageSize, totalPages }` response.
- **Delete / cancel (GEN-03):** always ask for confirmation with the shared confirm dialog.
- **Empty, loading and error states (GEN-04, GEN-16):** every list and page has them.
- **Flight times (GEN-06):** show each time in that airport's time zone with the shared formatter.
- **Navigation and labels (GEN-14, GEN-15):** users can go back or cancel without losing unrelated data; buttons have clear, plain labels.
- **Booking statuses (GEN-11):** show them with the shared status badge, so the colours are the same everywhere.

## 7. Tests and regression policy

**Tests are not obstacles to be edited away.** Existing tests can become outdated when the accepted requirements change, but that decision must be explicit.

1. Identify tests related to the task before editing.
2. Add or update tests that prove the approved behavior; include success, validation, auth/ownership and relevant error cases.
3. Preserve unrelated tests and coverage. Never delete, skip, weaken, or replace an assertion solely to make a build pass.
4. If a **new requirement conflicts with an old test**, report the exact test, old expected behavior, new requirement text and available options. **Do not change the old test or dependency behavior without user approval**, especially when the new feature is not yet being implemented.
5. Run lint, `npm run build`, the relevant unit tests and, for any API behaviour change, the e2e tests; report pass/fail separately. If a test fails, show the concise error and do not modify shared test config (`jest.config`, `test/jest-e2e.json`, `test/setup-e2e.ts`) or CI workflows without permission.
6. If possible, verify the endpoint through Swagger/Postman or isolated integration tests, without exposing credentials or modifying shared team data.
7. Never claim tests passed if they were not run.

### When behaviour changes, update every test that asserts it

When an approved change alters behaviour (a status code, message, field, limit or workflow):

- Search **both** unit tests (`backend/src/**/*.spec.ts`) and e2e tests (`backend/test/*.e2e-spec.ts`) for the old behaviour, e.g. grep for the old status code, message or field name.
- Update every assertion that encodes the old behaviour in the same PR, and say so in the PR description.
- Run unit **and** e2e tests before opening the PR.

Example of what goes wrong otherwise: ACC-05 was changed to return `423 Locked` on the 5th failed login, but an e2e test still expected `401` and failed later in CI.

Name tests after the requirement they prove (e.g. `ACC-05: fifth consecutive failure locks the account and returns 423`), not after the current implementation.

### Test quality: a test must be able to fail

A passing test only proves what it checks. The automatic review flags tests that can't catch a real bug, so write tests that:

- take expected values (status codes, messages, limits, fields) from the **requirement text**, not from what the code currently returns;
- don't mock the logic under test: mock only its edges (database, external services), and prefer e2e tests for rules that depend on the database (ownership, uniqueness, concurrency);
- assert the **result** (response body, status code, database state), not only that a function was called;
- cover the cases the requirement implies: success, validation `400`, unauthenticated `401`, forbidden or not-owner `403`, not found `404`, conflict `409`, and limits at and just past the boundary;
- would fail if the requirement's key rule were removed from the code.

Frontend tests live next to the code as `*.test.ts(x)` (Jest + React Testing Library). Mock `apiFetch`, not the component's own logic, and test what the user sees and does:

- the loading, empty and error states;
- the message for each backend error the page handles: field errors next to the right field (GEN-02), `401`, `403`, `404`, `409`;
- the confirmation step before delete or cancel (GEN-03);
- the exact request sent (path, method, body) and how the response is shown (`formatMoney`, airport times).

A test that only checks that the component renders, or a snapshot as the only check, does not count.

### Writing and running e2e tests

- Location: `backend/test/<feature>.e2e-spec.ts` (the file name must end in `.e2e-spec.ts`). Config: `backend/test/jest-e2e.json`; `backend/test/setup-e2e.ts` runs first.
- `setup-e2e.ts` creates a fresh random database per run and sets test-only JWT secrets and upload directory. **Never** point e2e tests at the shared Atlas database or read `.env`; the setup refuses remote hosts, credentials and query options.
- Follow the pattern of the existing e2e files: build the Nest app with the real modules and the global `ValidationPipe`, call the API with `supertest`, use cookies from login responses, and clean up what you create.
- The backend uses MongoDB **transactions**, so e2e tests need a **single-node replica set**, not a standalone `mongod`. Locally, for example with Docker:

  ```powershell
  docker run -d --name e2e-mongo -p 127.0.0.1:27017:27017 mongo:7 --replSet rs0 --bind_ip_all
  docker exec e2e-mongo mongosh --quiet --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"
  $env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017'
  npm run test:e2e -- --runInBand
  ```

- One ITN-20 test starts its own replica set and needs `ITN20_MONGOD_PATH` set to a local `mongod` binary. Without it, only that test fails. CI sets it automatically.
- CI (`.github/workflows/backend-ci.yml`) runs exactly this against a throwaway MongoDB; it never uses the shared database.

## 8. AI-use logging

Every task using AI must be logged with the fields below: in your **personal prompt log** if you have one (`AI_PROMPTS_<Name>.txt`, or `HANA_AI_PROMPTS.txt` for the team leader), otherwise in the shared **`AI_PROMPTS.txt`**. Commit the log entry in the same PR as the work. A personal log is preferred: every PR that appends to the shared `AI_PROMPTS.txt` conflicts with the next one that does. If you resolve such a conflict, keep **both** entries.

- Date
- Student name
- AI tool
- Related requirement ID(s)
- Prompt or accurate record of the request
- How the output was reviewed and used

Inspect the current prompt-log convention before appending. **Do not overwrite existing entries**, log private credentials, or claim code was reviewed/tested when it was not. If the active repository uses a differently named personal prompt file, check with the user before changing the intended submission log.

## 9. Required working sequence

For each requested task:

1. **Inspect safely:** Check branch, `git status` and relevant files; do not inspect secrets.
2. **Read authority:** Consult the exact requirement ID in the official sheet and project PDF, then code/tests.
3. **Confirm scope:** Summarize acceptance criteria, dependencies, planned files, and conflicts. Ask before cross-module changes or unspecified behavior.
4. **Implement minimally:** Follow existing patterns; avoid unrelated changes.
5. **Verify:** Run build and relevant tests; assess Swagger/API behavior and regressions where practical.
6. **Log AI usage:** Append to the approved AI prompt log without secrets.
7. **Report:** Summarize changed files, behavior, requirement IDs, checks executed and results, any blockers, and any remaining work. Identify anything not verified. Do not commit/push unless requested.

## 10. When to stop and ask

Stop before doing any of the following without explicit authorization:

- Editing shared files/config, changing dependencies or introducing an unrequested endpoint
- Changing another feature's behavior or preexisting test expectations
- Switching/renaming/deleting branches, stashing/discarding uncommitted work, or resolving merge conflicts
- Performing destructive or bulk operations in the shared database
- Changing the meaning of an ambiguous requirement, or implementing a declared dependency that is not in scope
- Committing, pushing, opening or merging a PR unless requested

When blocked, explain the issue, cite the specific requirement or file, and propose the smallest safe next step. Do not invent a workaround or silently widen scope.
