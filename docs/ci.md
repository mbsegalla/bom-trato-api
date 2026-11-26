# Continuous integration

CI runs on pushes to `develop` and `main`, and pull requests targeting `main`. It uses Node.js 24, the pnpm version declared in `package.json`, and the committed lockfile. The workflows are read-only, pin their actions to commit SHAs, and do not deploy or use production secrets.

## Development workflow

Keep the existing `develop -> main` workflow. Before committing locally, run:

```bash
pnpm lint:fix
pnpm format
pnpm check
pnpm build
```

Run formatting **after** ESLint autofixes. Fix all failures instead of disabling Husky, lint rules, or required checks.

Push to `develop` and confirm that the CI run for the exact branch head SHA completed successfully before opening a pull request. If CI fails, resolve the failure on `develop` and verify the new head. If no run or result is accessible, do not describe the change as validated or open a new pull request as though the checks passed.

PR checks validate the proposed merge into `main`. A successful push check does not replace this merge check. Repository administrators should require the validation job as a status check for `main`, without requiring PRs for pushes to `develop`. This workflow alone does not enforce branch protection.

See the repository Actions tab for run results and logs. No automatic deployment or merge is configured.

## Backend validation

The `Backend validation` job checks Prisma, generates the client, runs `pnpm check`, applies all migrations to a fresh PostgreSQL 17 service, runs the Vitest suite, and builds the API. The database and its fixed credentials are disposable CI-only fixtures. Do not point this workflow at a real database.

The local backend also needs a valid development `DATABASE_URL` for Prisma commands. Run the following after installing dependencies:

```bash
pnpm exec prisma validate
pnpm prisma:generate
pnpm exec vitest run --config vitest.config.ts
```

The migration step verifies the migration chain on an empty database; it does not prove the migration is safe against existing production data or that all application transactions have been integration-tested.
