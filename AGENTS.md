# Repository development instructions

- Follow the existing architecture, naming conventions, TypeScript, ESLint and Prettier configuration. Use English Conventional Commits.
- Implement and publish changes directly on `develop`. Do not create intermediate or feature branches. Never push directly to `main`.
- Keep ESLint, Prettier, `pnpm check` and Husky unchanged. The owner handles lint and formatting locally before merging; when local dependencies are available, run `pnpm lint:fix` before `pnpm format`, then `pnpm check`. Lint and formatting are not CI gates. CI must still pass typecheck, tests where configured, build and API Prisma/migration checks.
- Inspect the current branch heads and open pull requests before changing `develop`. Preserve existing work, use non-force updates with an expected-head guard, and validate the exact published SHA in GitHub Actions. Fix functional failures on `develop` before release.
- Verify the successful `develop` push run before opening a `develop` to `main` pull request. Do not merge automatically.
- Document migrations, dependencies, environment variables and any remaining validation limitations in the delivery and PR.

See [CI workflow](docs/ci.md) for the complete procedure.
