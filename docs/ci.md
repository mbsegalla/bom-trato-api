# Continuous integration

CI runs on pushes to `develop` and `main`, and pull requests targeting `main`. It uses Node.js 24, the pnpm version declared in `package.json`, and the committed lockfile. The workflows are read-only, pin their actions to commit SHAs, and do not deploy or use production secrets.

## Development workflow

Implement directly on `develop`, without intermediate branches. All release pull requests use `develop -> main`. Before committing locally, run:

```bash
pnpm lint:fix
pnpm format
pnpm check
pnpm build
```

Run formatting **after** ESLint autofixes. The repository owner validates and corrects lint/formatting locally before merging. ESLint, Prettier, `pnpm check` and Husky remain unchanged. CI deliberately does not run `pnpm check`, ESLint or Prettier; it runs `pnpm typecheck` and the functional checks below. A green CI is not evidence of a clean lint/format check.

### Development and release

1. Inspect the current `develop` and `main` heads and any open release pull request. Start from the current `develop`; integrate missing `main` changes when necessary without discarding work.
2. Follow the repository's coding conventions. Run local lint and formatting checks when dependencies are available. Publish changes directly to `develop` using non-force updates with an expected-head guard.
3. Verify the functional CI push run for the exact published commit. Fix any functional failures on `develop` and revalidate. Do not treat pending, skipped, canceled or failed checks as approval.
4. Open a release pull request from `develop` to `main` only after successful functional CI. If one is already open, keep it and verify the checks on its latest head. The owner handles local lint and formatting before merging. Do not merge automatically.

The `main` branch remains protected by its existing ruleset. No intermediate branch is required.

PR checks validate the proposed merge into `main`. A successful push check does not replace this merge check. Repository administrators should require the validation job as a status check for `main`, without requiring PRs for pushes to `develop`. This workflow alone does not enforce branch protection.

See the repository Actions tab for run results and logs. No automatic deployment or merge is configured.

## Backend validation

The `Backend validation` job checks Prisma, generates the client, runs `pnpm typecheck`, applies all migrations to a fresh PostgreSQL 17 service, runs the Vitest suite, and builds the API. The database and its fixed credentials are disposable CI-only fixtures. Do not point this workflow at a real database.

The local backend also needs a valid development `DATABASE_URL` for Prisma commands. Run the following after installing dependencies:

```bash
pnpm exec prisma validate
pnpm prisma:generate
pnpm exec vitest run --config vitest.config.ts
```

The migration step verifies the migration chain on an empty database; it does not prove the migration is safe against existing production data or that all application transactions have been integration-tested.
