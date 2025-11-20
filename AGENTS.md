# Repository Guidelines

## Project Structure & Module Organization
- Backend API lives in `src/` (Fastify server, routes for highlights/metadata/generated images, Prisma client) with SQLite migrations in `prisma/`.
- Automation and content utilities sit under `scripts/` (changelog generation, Readwise sync, URL hygiene) and `prompts/` (Cursor worldview prompt).
- VS Code extension is in `extension/jarvis4-worldview-updater/` with its own build/test tooling; media assets and SQL migrations are colocated there.
- Logs land in `logs/`; keep large artifacts out of the repo.

## Build, Test, and Development Commands
- Install deps: `pnpm install` at repo root; extension has its own `pnpm install` when working inside `extension/jarvis4-worldview-updater/`.
- Run backend locally: `pnpm dev` (watches `src/server.ts`), or `pnpm start` for a one-off run. Launchd helpers: `pnpm backend:start|stop|restart|status`.
- Database: `pnpm db:migrate:dev` for iterative schema changes; `pnpm db:migrate` for deploy; `pnpm db:studio` to inspect data.
- Scripts: `pnpm recent-changes`, `pnpm upload`, `pnpm sync:all`, `pnpm open-worldview:run` as the common operational flows.
- Extension build/test (from extension folder): `pnpm build`, `pnpm lint`, `pnpm test:unit`, `pnpm reinstall` to rebuild and reload in Cursor.

## Coding Style & Naming Conventions
- TypeScript across backend and extension; prefer 2-space indentation, single quotes, and explicit return types on exported functions.
- Follow existing module naming: services in `src/services`, route handlers in `src/routes`, and Prisma models in PascalCase.
- Use the shared `logger` util instead of `console`; keep request logs structured.
- Linting/formatting: ESLint + Prettier in the extension; keep backend code consistent with current style even though no formatter is enforced.

## Testing Guidelines
- Extension: Jest for unit tests (`pnpm test:unit`), VS Code integration via `pnpm test`. Place specs alongside source under `extension/.../src/test/`.
- Backend currently lacks automated tests; when adding endpoints, prefer lightweight Fastify handler tests or seed small fixtures in a throwaway SQLite file.
- Run focused scripts/tests before pushing; avoid breaking the changelog automation and DB migrations.

## Commit & Pull Request Guidelines
- Existing history favors concise, sentence-case subjects (e.g., “Upgrade logging system and optimize search performance”); mirror that style and keep scope small.
- Include context in the body when changing workflows, DB schema, or prompts. Reference migrations and scripts explicitly.
- For PRs: describe behavior change, testing performed, and any schema or service restarts required. Add screenshots for extension UI changes.

## Security & Configuration Tips
- Store secrets (Readwise token, OpenAI key) in environment variables; never commit tokens or `.env` files.
- When touching DB files, avoid committing local `db.sqlite`; rely on Prisma migrations instead.
- Launchd plist and personal symlinks are user-specific—document changes but do not commit generated paths.
