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

## Second regression expansion

The full CI suite now produces Vitest V8 coverage including unexecuted source
files, HTML/JSON reports and `coverage/layers.md` with weighted lines,
branches and functions per architectural layer. GitHub Actions publishes
`backend-coverage` and the job summary. Targets (not gates): domain 95%,
application 90%, infrastructure and presentation 80% line coverage.
Record a measured baseline before imposing thresholds. The report lists
zero-covered files; absence from that list does not establish adequate tests.
Coverage must not replace risk-based review of behavior.

New tests cover authentication use cases, checkout recovery and authorization,
Pix release admission, customer access and real PostgreSQL tenant isolation,
manual-payment duplicate requests and rollback. The customer HTTP suite
runs the actual access-token guard with fake token verification and session
repository; persistence isolation is exercised independently against the
CI database. No external providers are contacted. This does not yet cover
all endpoint/use-case permutations or deployed end-to-end flows.

## Third regression expansion — application workflows

The previous CI baseline was 728 passing tests and 29.48% overall line coverage (domain 75.3%, application 25.9%, infrastructure 19.9%, presentation 21.4%). This increment focuses on application orchestration: registration, verification and Google identity, organization invitation and membership, billing entitlements and cancellation, quotes, work order lifecycle, receivable automation, reviews and notification scope. The use-case specs exercise the real application services and domain entities with controlled mocks at persistence and external-service ports. Assertions cover the order of side effects and forbidden writes, not just successful return values. Transaction rollback and concurrency guarantees still require PostgreSQL integration tests; these mocks are not evidence of database atomicity. Read the new CI coverage report before updating baseline percentages or considering coverage thresholds.

## Fourth regression expansion — multiple layers

This round adds domain boundary tests, application use cases, cryptography and token adapters, HTTP guards and response contracts, plus disposable PostgreSQL tests for refresh-token reuse/concurrency, catalog tenant isolation, financial aggregation/reversal and public-link rate limiting. Reuse the disposable database fixture for new persistence tests; it accepts only the dedicated local CI database and deletes only test-owned rows. HTTP contract tests share a Nest validation/filter/guard harness with mocked application ports. Previous measured line coverage: Domain 77.6%, Application 46.9%, Infrastructure 19.9%, Presentation 21.4%, overall 33.79%. Remeasure after CI; goals are not yet achieved.
