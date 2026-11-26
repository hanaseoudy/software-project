# Travel Booking Platform — Codex Instructions

## 1. Project Overview
University Software Project I — Travel Planning and Booking Platform.

## 2. Technology Stack
- Backend: NestJS, TypeScript, Mongoose
- Database: MongoDB Atlas
- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS + shadcn/ui with Neobrutalism Components (GEN-17), in `frontend/`
- API Documentation: Swagger
- CI: GitHub Actions

`CLAUDE.md` has the full, detailed rules; this file is the short version. If they ever differ, `CLAUDE.md` wins.

## 3. Sources of Truth
Follow these sources in priority order:

1. `docs\requirments\Final_ SP1_Reviewed_Requirements.xlsx - Mandatory.csv`
2. `docs\requirments\software project.pdf`
3. Jira issues and acceptance criteria
4. Existing project code

Use exact requirement IDs (e.g., FLT-03, HTL-16, PAY-02).

If requirements conflict or are unclear, explain the conflict and request clarification before implementing.

## 4. Development Rules
- Read the relevant requirements before working on a task.
- Check requirement dependencies.
- Do not invent or assume business requirements.
- Follow existing project structure and naming conventions.
- Do not rename, move, delete, or refactor existing files unless explicitly requested.
- Implement only the assigned task.
- Use DTOs for request validation and services for business logic.
- Preserve existing database schemas, API contracts, and functionality unless changes are approved.
- Never expose credentials or commit `.env` files.
- Run applicable builds and tests after approved changes.
- Do not modify unrelated teammates' work.

## 5. Approval Process
Before making ANY changes:

1. Inspect relevant files.
2. Explain the proposed implementation briefly.
3. List every file to be created, modified, or deleted.
4. Wait for explicit approval.

Do not modify files, install dependencies, or execute destructive commands before approval.

After implementation, summarize changes and test results concisely.

## 6. Git Workflow
- Create feature branches from the latest `develop` branch.
- One Jira task = one branch = one PR. Put the Jira key in the branch name and the PR title: branch `feature/<REQ-ID>-TASK-<n>-<description>`, title `TASK-<n> [<planning ID>] <description>`. CI fails PRs without a `TASK-<n>` key (`chore/` and `docs/` branches are exempt).
- Fill in every section of the PR template (`.github/pull_request_template.md`). See `docs/PR-REVIEW-PROCESS.md`.
- Only the team leader (`@hanaseoudy`) reviews, approves and merges. No peer reviewers, no CODEOWNERS. Never merge a PR.
- Open pull requests into `develop`.
- Merge `develop` into `main` for milestone releases.
- Do not develop directly on `main`.
- Do not commit, push, or merge without explicit approval.
- Never overwrite or remove another teammate's work while resolving conflicts.

## 7. Frontend Rules (Milestone 2)
- **Design system (GEN-17) is mandatory:** Neobrutalism Components on Tailwind CSS + shadcn/ui. Use the shared theme and components only; no other UI library.
- **Colours: only the agreed palette, through theme tokens:**
  - Cream `#F5EFDC` (background), Burgundy `#63383C` (primary buttons, headings), Sage Green `#A8B79A` (secondary backgrounds), Olive Green `#697D50` (secondary buttons, accents), Terracotta `#C48772` (decorative accents), Mustard Yellow `#D9B65D` (highlights), Dark Brown `#352C28` (text, borders, shadows).
- **Fonts:** Fraunces for headings, page titles and branding; DM Sans for everything else.
- **Reuse the shared components** (built in their own FND-*/PAYC-* tasks by whoever is assigned): the API client, auth context and route guards, layout/navbar, form error display, confirm dialog, empty state, pagination, loading/error/toast feedback, image upload, time formatter, status badge, pickers. If something is missing, stop and ask; never write a page-specific copy. Anyone may build a shared component as their assigned task (reusable, typed props, usage example in the PR); change someone else's shared component only after agreeing it with its author or the team leader.
- **Auth:** httpOnly cookies only; never store tokens in `localStorage`/`sessionStorage`. All calls go through the API client.
- **Backend URL** comes from an environment variable; never hardcode `localhost`. No secrets in `NEXT_PUBLIC_*` variables.
- **Use the API exactly as documented in Swagger.** Don't invent endpoints, fields or status codes.
- **Every page:**
  - shows backend validation errors per field (`{ message, errors: { field: [...] } }`, including nested paths like `days.0.city`);
  - uses `?page=` pagination (page size 10);
  - confirms deletes and cancels;
  - has empty, loading and error states;
  - works on desktop, tablet and mobile.
- Frontend checks are UX only; the backend enforces all rules (GEN-13).

## 8. Testing and CI
- Required CI checks on every PR into `develop`/`main`; all must pass:
  - `Backend lint, build and unit tests`
  - `Backend e2e tests`
  - `Frontend lint, type-check and build`
  - `Jira task link and PR size`
- Run the same checks locally before pushing:
  - backend: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`;
  - frontend: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- The old Jest ES-module problem is fixed (verified 26 November 2026). A failing test is a real problem to investigate.
- **When approved behaviour changes** (status code, message, field, limit), search both unit tests (`backend/src/**/*.spec.ts`) and e2e tests (`backend/test/*.e2e-spec.ts`) for the old behaviour and update them in the same PR. Example: ACC-05 changed to `423` on the 5th failed login, but an e2e test still expected `401`.
- Name tests after the requirement they prove, not the current implementation.
- **E2E tests:**
  - Location: `backend/test/<feature>.e2e-spec.ts`. `test/setup-e2e.ts` creates a random throwaway database.
  - They need a **disposable local MongoDB single-node replica set** (transactions are used) via `TEST_MONGODB_URI=mongodb://127.0.0.1:<port>`. Never the shared Atlas database or `.env`.
  - One ITN-20 test also needs `ITN20_MONGOD_PATH` (a local `mongod` binary).
  - See `CLAUDE.md` section 7 for the Docker commands.
- Do not create fake tests or modify tests solely to make CI pass.
- Do not change CI workflows, Jest config or the e2e setup, or bypass failing checks, without approval.
- Report failures accurately.

## 9. AI Usage Documentation
- Follow Section 11 of the official project PDF.
- Document meaningful AI-assisted contributions in your personal prompt log (`AI_PROMPTS_<Name>.txt`, or `HANA_AI_PROMPTS.txt`) if you have one, otherwise in the shared `AI_PROMPTS.txt`, in the same PR as the work.
- Include date, student name, AI tool, requirement ID, prompt, and how the output was used.
- Do not record credentials or sensitive information.
- Keep AI usage transparent.

## 10. Communication
- Keep responses concise to minimize token usage.
- Avoid unnecessary explanations, repeated information, or large code dumps.
- Explain important decisions and risks.
- Ask for approval only when changes are proposed.
- Do not claim tests passed unless they were executed successfully.