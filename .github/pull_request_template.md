<!--
Title format: TASK-<n> [<planning ID>] <short description>
Example:      TASK-160 [FLT-1] Flight search page
Branch name:  feature/<REQ-ID>-TASK-<n>-<description>, e.g. feature/FLT-1-TASK-160-flight-search
One Jira task = one branch = one PR. Target branch: develop.
-->

## Jira task and requirements

- **Jira task:** TASK-
- **Planning ID:** <!-- e.g. FLT-1, FND-3, BE-2 -->
- **Requirement IDs:** <!-- e.g. FLT-01, FLT-02, GEN-05 -->

## What changed

<!-- 2–5 bullet points. What does the reviewer need to know? -->

-

## Endpoints

<!-- Every API endpoint this PR calls or adds/changes. Write "None" if not applicable. -->

| Method | Path | Used / Added / Changed |
| --- | --- | --- |
| | | |

## How I tested it

<!-- Steps the reviewer can repeat. Include the test user role (Guest, User, Admin, Airline/Hotel Moderator). -->

1.

- [ ] CI is green (lint, type-check, build, tests)
- [ ] I tested it myself in the browser / Swagger
- [ ] I added or updated automated tests (backend changes)

## Checklist

- [ ] The PR covers **one** Jira task only and targets `develop`
- [ ] Frontend follows the GEN-17 design system: Neobrutalism components (Tailwind + shadcn/ui), the agreed palette and fonts (Fraunces headings, DM Sans text); no one-off colours or fonts
- [ ] I reused the shared components, API client and layout instead of copying them
- [ ] Lists use the shared pagination (page size 10); forms show the backend validation errors per field
- [ ] No `.env` files, secrets, tokens, passwords or connection strings anywhere in the code, screenshots or this description
- [ ] No unrelated changes (formatting churn, other people's files, `node_modules`, build output)
- [ ] I logged my AI use in `AI_PROMPTS.txt` (or my personal `AI_PROMPTS_<Name>.txt`): date, name, tool, requirement IDs, prompt, how I reviewed and used the output

## Known limitations / notes for the reviewer

<!-- Anything unfinished, assumptions you made, or questions. Write "None" if not applicable. -->
