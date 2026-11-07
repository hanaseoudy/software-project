# Travel Booking Platform — Codex Instructions

## 1. Project Overview
University Software Project I — Travel Planning and Booking Platform.

## 2. Technology Stack
- Backend: NestJS, TypeScript, Mongoose
- Database: MongoDB Atlas
- Frontend: Next.js
- API Documentation: Swagger
- CI: GitHub Actions

## 3. Sources of Truth
Follow these sources in priority order:

1. `docs/requirements/SP1_Reviewed_Requirements.xlsx`
2. `docs/requirements/Project_Description.pdf`
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
- Open pull requests into `develop`.
- Merge `develop` into `main` for milestone releases.
- Do not develop directly on `main`.
- Do not commit, push, or merge without explicit approval.
- Never overwrite or remove another teammate's work while resolving conflicts.

## 7. Testing and CI
- Follow the existing GitHub Actions workflows.
- Run applicable lint, build, unit tests, and E2E tests.
- Do not create fake tests or modify tests solely to make CI pass.
- Do not bypass failing checks without approval.
- Report failures accurately.

## 8. AI Usage Documentation
- Follow Section 11 of the official project PDF.
- Document meaningful AI-assisted contributions in the shared `AI_PROMPTS.txt` file.
- Include date, student name, AI tool, requirement ID, prompt, and how the output was used.
- Do not record credentials or sensitive information.
- Keep AI usage transparent.

## 9. Communication
- Keep responses concise to minimize token usage.
- Avoid unnecessary explanations, repeated information, or large code dumps.
- Explain important decisions and risks.
- Ask for approval only when changes are proposed.
- Do not claim tests passed unless they were executed successfully.