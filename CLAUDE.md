# CLAUDE.md — Repository Instructions for Claude Code

Read this entire file before making changes. These instructions apply to every task in this repository. When a request conflicts with this file, the official requirements or the project PDF, explain the conflict and ask before changing behavior.

## 1. Project and delivery context

**GIU Software Project I (Winter 2026): Travel Planning and Booking Platform** — flight and hotel bookings, itinerary planning and budgets.

- **Backend:** NestJS, TypeScript, MongoDB Atlas, Mongoose; one shared Atlas database for the team.
- **Frontend:** Next.js App Router, React, TypeScript; developed in Milestone 2.
- **Architecture:** feature-based MVC. Controllers handle HTTP; services implement business logic and database access; Mongoose schemas define persistence.
- **Roles:** Guest, Registered User, Admin, Airline Moderator, Hotel Moderator, System.
- **Milestone 1:** backend and Swagger, 20 November 2026.
- **Milestone 2:** frontend and integration, 11 December 2026.
- **Environment:** Windows PowerShell. Use PowerShell-compatible commands.

### Repository layout

```text
software-project/
  backend/
    src/
      auth/ users/ admin/ airlines/ flights/ flight-bookings/
      hotels/ hotel-bookings/ payments/ itineraries/
      reports/ uploads/ notifications/ audit-logs/ exchange-rates/
      reference-data/ common/
      main.ts app.module.ts
  docs/
    requirments/      # Folder name is intentionally spelled this way
    postman/ api/
  AI_PROMPTS.txt
  README.md
  .env.example
```

Modules usually contain `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` and `schemas/`. Inspect actual paths rather than assuming every module is identical.

### Common commands (from `backend/`)

```powershell
npm install
npm run start:dev
npm run build
npm test
```

Swagger UI: `http://localhost:3000/api/docs` (when the server is running on port 3000).

**Known testing limitation:** Jest currently fails to load `@nestjs/testing` as an ES module across spec files; the same issue occurs on `develop`. Do not modify Jest configuration, delete tests, or misrepresent this as a feature failure. Still try the appropriate checks and report the exact blocker. Do not assume this limitation persists forever; distinguish verified current results from this note.

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

Naming examples:

- `feature/ITN-21-TASK-89-public-search`
- `fix/ITN-20-public-visibility`
- `docs/ai-prompt-log`
- `refactor/<description>`

Use Conventional Commits with the requirement ID, e.g. `feat(itineraries): add public search filters ITN-21`. PRs target `develop`, explain the requirement IDs, changed behavior, verification and known limitations, and include only task-related files. Do not open, push or merge a PR unless requested.

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

## 6. Tests and regression policy

**Tests are not obstacles to be edited away.** Existing tests can become outdated when the accepted requirements change, but that decision must be explicit.

1. Identify tests related to the task before editing.
2. Add or update tests that prove the approved behavior; include success, validation, auth/ownership and relevant error cases.
3. Preserve unrelated tests and coverage. Never delete, skip, weaken, or replace an assertion solely to make a build pass.
4. If a **new requirement conflicts with an old test**, report the exact test, old expected behavior, new requirement text and available options. **Do not change the old test or dependency behavior without user approval**, especially when the new feature is not yet being implemented.
5. Run the smallest relevant tests available and `npm run build`; report pass/fail separately. If the known Jest ESM blocker occurs, show the concise error and do not modify shared test config without permission.
6. If possible, verify the endpoint through Swagger/Postman or isolated integration tests, without exposing credentials or modifying shared team data.
7. Never claim tests passed if they were not run.

## 7. AI-use logging

Every task using AI must be logged in the repository's **`AI_PROMPTS.txt`** with:

- Date
- Student name
- AI tool
- Related requirement ID(s)
- Prompt or accurate record of the request
- How the output was reviewed and used

Inspect the current prompt-log convention before appending. **Do not overwrite existing entries**, log private credentials, or claim code was reviewed/tested when it was not. If the active repository uses a differently named personal prompt file, check with the user before changing the intended submission log.

## 8. Required working sequence

For each requested task:

1. **Inspect safely:** Check branch, `git status` and relevant files; do not inspect secrets.
2. **Read authority:** Consult the exact requirement ID in the official sheet and project PDF, then code/tests.
3. **Confirm scope:** Summarize acceptance criteria, dependencies, planned files, and conflicts. Ask before cross-module changes or unspecified behavior.
4. **Implement minimally:** Follow existing patterns; avoid unrelated changes.
5. **Verify:** Run build and relevant tests; assess Swagger/API behavior and regressions where practical.
6. **Log AI usage:** Append to the approved AI prompt log without secrets.
7. **Report:** Summarize changed files, behavior, requirement IDs, checks executed and results, any blockers, and any remaining work. Identify anything not verified. Do not commit/push unless requested.

## 9. When to stop and ask

Stop before doing any of the following without explicit authorization:

- Editing shared files/config, changing dependencies or introducing an unrequested endpoint
- Changing another feature's behavior or preexisting test expectations
- Switching/renaming/deleting branches, stashing/discarding uncommitted work, or resolving merge conflicts
- Performing destructive or bulk operations in the shared database
- Changing the meaning of an ambiguous requirement, or implementing a declared dependency that is not in scope
- Committing, pushing, opening or merging a PR unless requested

When blocked, explain the issue, cite the specific requirement or file, and propose the smallest safe next step. Do not invent a workaround or silently widen scope.
