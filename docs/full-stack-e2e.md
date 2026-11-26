# Phase 5.1 — Full-stack E2E

The frontend repository owns the opt-in Full-stack E2E workflow. It checks out
an exact backend commit, generates Prisma Client, applies migrations to a
fresh PostgreSQL 17 database, builds the backend and starts its normal NestJS
entry point. Playwright drives the real Next.js frontend and API.

The backend helpers in `test/e2e/support` are test-only, not application
routes. They require `BOM_TRATO_E2E=1`, the exact dedicated loopback database
URL and no backend `.env` file. The launcher passes an explicit synthetic
environment, disables all external-delivery/background payment workers and
restricts outgoing TCP connections to the local PostgreSQL port. The browser
also blocks requests to non-local origins.

Registration persists the normal encrypted verification email. The read-only
inspector opens a transaction against the dedicated database, finds the
synthetic recipient, decrypts the message using the fixture key and returns
the actual verification URL. The browser follows the link and the normal
verification use case consumes the token. This does not bypass verification,
create a test-only auth route, or write directly to the user tables.

The initial journey covers registration, legal acceptance, email verification,
trial creation, dashboard access, refresh-cookie restoration and password
login in a fresh browser session. Read-only database assertions check the
verified user, owner membership, trial duration, unique organization and
trial, and absence of subscription, checkout or Stripe customer.

All identities and credentials are synthetic. Real email delivery, payment
providers, OAuth and object storage are not homologated by this suite.
Never run the helpers against a development or production database. The
workflow uses a fresh runner, local services and no production secrets.
Reports contain only synthetic test data.
