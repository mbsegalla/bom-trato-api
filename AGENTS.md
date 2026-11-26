# Repository development instructions

- Follow the existing architecture, naming conventions, TypeScript, ESLint and Prettier configuration. Use English Conventional Commits.
- Reuse the permanent `ci/preflight` branch. Do not create a branch for each feature or push unvalidated candidate changes directly to `develop` or `main`.
- Run `pnpm lint:fix` before `pnpm format`, then `pnpm check`, tests where configured and `pnpm build`. In the API, validate Prisma, generate its client and test the migration chain whenever relevant. Never bypass quality rules.
- Use the GitHub Actions push run on `ci/preflight` to validate the exact candidate commit. Fix failures there and rerun before promotion.
- Promote only the approved SHA by fast-forwarding `develop` with an expected-head guard. If the base changed or there is other pending work, review and revalidate rather than overwriting changes.
- Verify the successful `develop` push run before opening a `develop` to `main` pull request. Do not merge automatically.
- Document migrations, dependencies, environment variables and any remaining validation limitations in the delivery and PR.

See [CI workflow](docs/ci.md) for the complete procedure.
