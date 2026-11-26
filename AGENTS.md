# Repository development instructions

- Follow the existing architecture, naming conventions, TypeScript, ESLint and Prettier configuration. Use English Conventional Commits.
- Reuse the permanent `ci/preflight` branch. Do not create a branch for each feature or push unvalidated candidate changes directly to `develop` or `main`.
- Keep ESLint, Prettier, `pnpm check` and Husky unchanged. The owner handles lint and formatting locally before merging; when local dependencies are available, run `pnpm lint:fix` before `pnpm format`, then `pnpm check`. Lint and formatting are not CI gates. CI must still pass typecheck, tests where configured, build and API Prisma/migration checks.
- Use the GitHub Actions push run on `ci/preflight` to validate the exact candidate commit. Fix failures there and rerun before promotion.
- Promote only the approved SHA by fast-forwarding `develop` with an expected-head guard. If the base changed or there is other pending work, review and revalidate rather than overwriting changes.
- Verify the successful `develop` push run before opening a `develop` to `main` pull request. Do not merge automatically.
- Document migrations, dependencies, environment variables and any remaining validation limitations in the delivery and PR.

See [CI workflow](docs/ci.md) for the complete procedure.
