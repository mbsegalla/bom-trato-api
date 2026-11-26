# Continuous integration

CI runs on pushes to `ci/preflight`, `develop` and `main`, and pull requests targeting `main`. It uses Node.js 24, the pnpm version declared in `package.json`, and the committed lockfile. The workflows are read-only, pin their actions to commit SHAs, and do not deploy or use production secrets.

## Development workflow

Keep one permanent `ci/preflight` branch for candidate validation. All release pull requests still use `develop -> main`. Before committing locally, run:

```bash
pnpm lint:fix
pnpm format
pnpm check
pnpm build
```

Run formatting **after** ESLint autofixes. Fix all failures instead of disabling Husky, lint rules, or required checks.

### Preflight and promotion

1. Inspect the current `develop`, `main` and `ci/preflight` heads and any open pull request. Start from the current `develop` and include any missing `main` changes when necessary. Never discard pending work on the preflight branch; resolve divergences deliberately.
2. Run lint autofixes, formatting, checks, tests and build locally when dependencies are available. Publish the candidate to `ci/preflight`, not `develop`. The same read-only CI job runs with the same lockfile and configuration on all three branches.
3. Verify a completed, successful push workflow for the exact candidate SHA on `ci/preflight`. If it fails, use the actual lint/formatting diff in the job logs and fix the candidate there. Revalidate every changed SHA. Do not promote a pending, skipped, canceled or failed candidate.
4. Verify `develop` has not moved since the candidate was prepared and the candidate includes its head in its ancestry. Fast-forward `develop` to the exact approved commit using a non-force update with an expected-head guard. If `develop` or `main` changed in the meantime, review the new changes, integrate as needed and revalidate before promotion.
5. Confirm the successful `develop` push workflow for the promoted SHA before opening or updating the release pull request. The PR's merge check must also pass. Do not merge to `main` automatically.

The preflight branch is reusable. Keep it in sync with the approved `develop` baseline between deliveries, preserving history and avoiding force pushes. A failed preflight run is useful feedback, not approval. If validation results are unavailable, stop before promotion.

This is a promotion procedure, not a new GitHub branch restriction. It does not prevent someone with write access from pushing directly to `develop`. Keep production deployments restricted to their existing approved branch; review any external deployment provider's preview-branch settings separately.

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
