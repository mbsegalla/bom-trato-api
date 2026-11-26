# Testing the API

## Structure

- `src/modules/<module>/domain/**/*.spec.ts`: deterministic domain rules, invariants, boundaries and state transitions. No database or network.
- `src/modules/<module>/application/**/*.spec.ts`: use cases with fakes at ports; assert outcomes and forbidden side effects.
- `src/modules/<module>/infrastructure/**/*.spec.ts`: adapters and external contracts with synthetic data and controlled dependencies.
- `test/integration/<module>/*.integration.spec.ts`: PostgreSQL transactions, uniqueness, concurrency, persistence and idempotency. Keep setup and cleanup in a local support fixture.
- `test/http/<module>/*.http.spec.ts`: Nest HTTP contracts using Supertest, validation and status codes. These are not full deployed-system E2E tests.

The receivables integration suite is divided into issuance, recovery, settlement, credentials and ledger files. Each uses independent fixtures; no test may depend on execution order. Preserve all existing scenarios.

## Commands

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:http
pnpm test:coverage
```

The full suite remains the required Backend CI check alongside existing typecheck, Prisma, migration and build checks. Database tests require the disposable PostgreSQL configuration used by CI; see `docs/ci.md`. Do not run destructive fixture cleanup against a development or production database. A skipped database test is not evidence of passing integration coverage.

## Maintenance policy

For each feature or bug fix add the smallest useful regression test in the owning layer. Cover the happy path, invalid input, boundary values, permissions, organization isolation, state transitions, idempotency and rollback when applicable. Financial operations require transaction and concurrency tests, not just mocks. Use named fixtures, fixed dates, synthetic identities and scoped cleanup. Avoid tests that simply restate implementation, broad snapshots and real provider credentials. Keep network adapters mocked unless explicitly running a disposable integration environment.

Coverage reports are diagnostic; prioritize untested risky behavior over an arbitrary percentage. This expansion is a baseline, not proof of exhaustive coverage. Remaining priorities include complete CRUD/use-case and HTTP authorization matrices, Stripe webhook retries, real database isolation across all modules, and deployed end-to-end workflows. External payment/OAuth homologation remains separate.
