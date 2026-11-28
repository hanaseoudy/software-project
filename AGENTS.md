# Travel Booking Platform — Instructions for AI Agents (Codex and others)

## 1. Read CLAUDE.md first

**Before starting any task, read `CLAUDE.md` in the repository root in full and follow it.** It is the single, complete set of rules for this repository: project context, sources of truth, safety rules, Git workflow, backend and frontend conventions, tests, AI-use logging, and when to stop and ask. The rules in `CLAUDE.md` apply to you exactly as written, even though the file is named after Claude Code.

This file adds only what is specific to other agents (below). It deliberately does not repeat `CLAUDE.md`, so the two can never disagree. If anything here seems to conflict with `CLAUDE.md`, `CLAUDE.md` wins; tell the user about the conflict.

For frontend work, also read the relevant sections of `frontend/README.md` (folder structure, route map, calling the backend, errors in Server Components), as `CLAUDE.md` section 6 says.

## 2. Sources of truth (summary of CLAUDE.md section 2)

1. `docs\requirments\Final_ SP1_Reviewed_Requirements.xlsx - Mandatory.csv`
2. `docs\requirments\software project.pdf`
3. Jira issues and acceptance criteria
4. Existing project code and tests (evidence of current behaviour, not authority)

Use exact requirement IDs (e.g. FLT-03, HTL-16, PAY-02). Never invent business rules.

## 3. Approval process

Before making ANY changes:

1. Inspect the relevant files.
2. Explain the proposed implementation briefly.
3. List every file to be created, modified or deleted.
4. Wait for explicit approval.

Do not modify files, install dependencies or run destructive commands before approval. After implementing, summarise the changes and test results concisely.

## 4. Communication

- Keep responses concise to minimise token usage.
- Avoid unnecessary explanations, repeated information or large code dumps.
- Explain important decisions and risks.
- Do not claim tests passed unless they were executed successfully.
