# Repository development instructions

- Follow the existing architecture, naming conventions, TypeScript, ESLint and Prettier configuration. Use English Conventional Commits.
- Implement and publish changes directly on `develop`. Do not create intermediate or feature branches. Never push directly to `main`.
- Keep ESLint, Prettier, `pnpm check` and Husky unchanged. The owner handles lint and formatting locally before merging; when local dependencies are available, run `pnpm lint:fix` before `pnpm format`, then `pnpm check`. Lint and formatting are not CI gates. CI must still pass typecheck, tests where configured, build and API Prisma/migration checks.
- Inspect the current branch heads and open pull requests before changing `develop`. Preserve existing work and use non-force updates with an expected-head guard.
- After publishing to `develop`, open or reuse a `develop` to `main` pull request. Automatic functional CI runs only on pull requests targeting `main`; manual dispatch is optional. Verify the successful PR check for the latest proposed merge before release. Fix functional failures on `develop` and revalidate. Do not merge automatically.
- Document migrations, dependencies, environment variables and any remaining validation limitations in the delivery and PR.

See [CI workflow](docs/ci.md) for the complete procedure.

## Tests

Follow [docs/testing.md](docs/testing.md). Add regression tests in the owning layer for every behavior change; keep unit tests colocated, PostgreSQL integration tests under test/integration by module, and HTTP contracts under test/http by module. Keep fixtures independent and never weaken security checks to make tests pass. Run the relevant tests and full functional CI before merging.
