# Pull Request and Review Process (Milestone 2)

The team leader (Hana, `@hanaseoudy`) is the **only** person who reviews, approves and merges pull requests into `develop` and `main`. Everyone else opens PRs; nobody merges their own work. There are no peer reviewers and no CODEOWNERS file.

## 1. For everyone: how to open a PR

1. **One Jira task = one branch = one PR.** Keep PRs small. A PR that changes more than about 800 lines gets a warning in CI.
2. **Start from the latest `develop`:**
   ```powershell
   git switch develop
   git pull --ff-only origin develop
   git switch -c feature/<REQ-ID>-TASK-<n>-<description>
   ```
   Example: `feature/FLT-1-TASK-160-flight-search`.
3. **Put the Jira key (`TASK-<n>`) in the branch name and the PR title.** Example title: `TASK-160 [FLT-1] Flight search page`. Jira uses the key to show the branch, PR and CI status in the task's **Development** panel. The `PR checks` workflow fails if the key is missing (except for `chore/` and `docs/` branches and the `develop` → `main` release PR).
4. **Target `develop`.** Never `main`.
5. **Fill in every section of the PR template:** Jira task and requirement IDs, desktop and mobile screenshots, the Vercel preview link, endpoints used, how you tested it, and the checklist (GEN-17 design system, no secrets, `AI_PROMPTS` log updated).
6. **Wait for CI to go green.** Fix any red check yourself before asking for review. A PR with a red check cannot be merged.
7. **Request a review from `@hanaseoudy`.**

## 2. Automatic checks (GitHub Actions)

These run on every PR into `develop` or `main`:

| Workflow | Check name | What it does |
| --- | --- | --- |
| Backend CI | `Backend lint, build and unit tests` | `npm ci`, `npm run lint` (oxlint), `npm run build` (also the TypeScript type-check), `npm test` |
| Backend CI | `Backend e2e tests` | Starts a throwaway MongoDB inside the CI machine and runs `npm run test:e2e`. It never connects to the shared Atlas database. |
| Frontend CI | `Frontend lint, type-check and build` | `npm ci`, `npm run lint`, `tsc --noEmit`, `npm run build` and `npm test` if it exists. It passes without doing anything until `frontend/package.json` exists (FND-1). |
| PR checks | `Jira task link and PR size` | Requires a `TASK-<n>` key in the branch name or PR title. Warns when the PR is large. |

Run the same commands locally before pushing so CI doesn't surprise you.

## 3. Vercel preview deployments (one-time setup by Hana)

Every PR gets its own preview URL, so the reviewer can click through the page without checking out the branch.

1. Sign in at <https://vercel.com> **with the `hanaseoudy` GitHub account** (Hobby plan is enough).
2. **Add New… → Project → Import** `hanaseoudy/software-project`. Allow the Vercel GitHub app access to that repository only.
3. **Root Directory:** `frontend`. **Framework preset:** Next.js. Leave the build and output settings at their defaults.
4. **Environment variables:** add the backend URL variable that FND-2 defines (for example `NEXT_PUBLIC_API_URL`) for **Preview** and **Production**. Never put secrets in a `NEXT_PUBLIC_*` variable; they are sent to the browser.
5. **Settings → Git → Production Branch:** `main`. Every other branch (including `develop` and every PR) gets a preview deployment automatically.
6. **Settings → Build and Deployment:** turn on **"Skip deployments when there are no changes to the root directory or its dependencies"** so backend-only PRs don't build the frontend.
7. **Settings → Deployment Protection:** keep **Vercel Authentication** on for previews if you want only logged-in Vercel users to open them. Turn it off if teammates without Vercel accounts need to open preview links.

The Vercel bot then comments on each PR with the preview link and adds a `Vercel` status. **Don't** make the Vercel status a required check: it doesn't run on backend-only PRs.

> **Note:** pages that call the API only work in a preview if the backend is deployed somewhere the preview can reach, and if the backend allows that origin (or the FND-2 `/api` rewrite proxy is used). Until then, previews are still useful for checking layout, the design system and mobile views.

## 4. AI-assisted review (Hana, before the final review)

Run a first-pass AI review in Claude Code from the repository folder:

```text
/code-review <PR number>              # findings shown only to you, in the terminal
/code-review <PR number> --comment    # also posts the findings as inline PR comments
```

It looks for bugs and for violations of `CLAUDE.md` (secrets, validation, auth, pagination, no invented rules). Treat the findings as suggestions: check each one before asking the author to change something. The final review and the merge decision stay with the team leader. Log this use of AI in the prompt log like any other.

## 5. GitHub settings that enforce "only the team leader merges" (manual, Hana)

These settings can't be stored in the repository; set them once in the GitHub web UI. The repository is public and owned by a personal account, so **repository rulesets** are available on the free plan.

### 5.1 Ruleset A: "Protect develop and main" (applies to everyone, including Hana)

**Settings → Rules → Rulesets → New ruleset → New branch ruleset**

- **Ruleset name:** `Protect develop and main`
- **Enforcement status:** Active
- **Bypass list:** leave **empty**, so nobody (not even an admin) can skip the checks.
- **Target branches → Add target → Include by pattern:** `develop` and `main`
- **Rules:**
  - ✅ **Restrict deletions**
  - ✅ **Block force pushes**
  - ✅ **Require a pull request before merging**
    - **Required approvals:** `0`. Only you can merge (see Ruleset B), so your merge *is* the approval. With `1`, you could never merge your own PRs, because GitHub doesn't let authors approve their own PRs.
    - ✅ **Require conversation resolution before merging**
    - **Allowed merge methods:** your choice (for example merge commit and squash)
  - ✅ **Require status checks to pass**
    - Add: `Backend lint, build and unit tests`, `Backend e2e tests`, `Frontend lint, type-check and build`, `Jira task link and PR size`
    - The names only appear in the search box after the checks have run once (for example on the PR that adds this file).
    - Leave **"Require branches to be up to date before merging"** off. With about 90 parallel PRs, it would force constant re-merges of `develop`.

### 5.2 Ruleset B: "Only the team leader updates develop and main"

**New branch ruleset** again:

- **Ruleset name:** `Only team leader merges`
- **Enforcement status:** Active
- **Target branches:** `develop` and `main`
- **Rules:**
  - ✅ **Restrict updates**: only users on the bypass list can change these branches.
- **Bypass list → Add bypass → Repository admin** (that is only `hanaseoudy`). Set its mode to **"For pull requests only"**, so you can merge PRs but you also can't push directly to `develop`/`main` by mistake.

Result: collaborators can push their own branches and open PRs, but the **Merge** button is disabled for them on `develop` and `main`. You can merge only when all required checks are green.

### 5.3 Collaborators and other settings

- **Settings → Collaborators:** keep every teammate as a normal collaborator (Write). Don't add anyone else as an admin; admins would be in the Ruleset B bypass list.
- **Settings → General → Pull Requests:** optionally turn on **"Automatically delete head branches"** to keep the branch list clean.
- **Settings → Actions → General:**
  - Under **Workflow permissions**, keep **Read repository contents** and leave **"Allow GitHub Actions to create and approve pull requests"** unchecked.
  - Under **Fork pull request workflows**, require approval for outside contributors.
- **Limitation:** on a personal repository, GitHub can't stop a collaborator from clicking **Approve** on a PR. Such an approval has no effect, because only you can merge.
