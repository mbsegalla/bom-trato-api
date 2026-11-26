# Phase 4.5.6 — production readiness and homologation gate

> Release update (4.5.10): this page documents a historical increment. For the current bounded pilot gate, credential continuity, deployment, homologation checklist and incident response, follow [the production pilot runbook](mercado-pago-production-pilot.md). All live switches remain disabled by default; external verification and explicit operator approval are still mandatory.

This increment verifies the existing financial settlement transaction and the
sandbox webhook inbox with a disposable PostgreSQL database. It also requires
explicit live-mode registration of provider charges: sandbox registrations
are rejected before a real ledger binding is created, and test confirmations
remain ignored. The provider confirmation use case is internal; no public
route, live issuer or live webhook worker is activated.

## Automated release checks

The existing Backend CI test step supplies PAYMENT_INTEGRATION_DATABASE_URL
for its disposable PostgreSQL service after migration deploy. The integration
suites refuse non-local databases, use generated fixture identities, and
never fall back to DATABASE_URL. They use no Mercado Pago credentials or
network payment calls. They cover:

- concurrent duplicate confirmations and exact one-time ledger/version update;
- rollback and successful retry after an injected failure between aggregate
  save and payment creation;
- sandbox registration/confirmation rejection, unmatched identities,
  cross-organization binding, amount/version mismatch and sticky review;
- valid settlement after platform access expires versus ownership changes;
- concurrent webhook delivery, exclusive claims, expired leases, stale
  completions, retry backoff, exhausted review records and application scope.

Existing schema, migration, typecheck, unit test and build checks remain.
No lint/format checks are added. No new dependencies, runtime environment
variables or migrations. The database-test-only variable is optional for
ordinary local unit tests; absence skips the PostgreSQL suites. CI sets it
explicitly and must pass before release.

## External homologation (not performed by CI)

Use an isolated test deployment with a real Mercado Pago test application,
HTTPS callback, test seller/buyer and test signing secret. Do not copy live
credentials or customer data into this environment.

- [ ] Complete OAuth, disconnect/reconnect and credential expiry/rotation.
- [ ] Issue a sandbox charge, compare the amount and provider reference.
- [ ] Recover an uncertain create with the original reference; verify that
  ambiguous or missing results never create another charge.
- [ ] Deliver correctly signed, invalid, duplicate and out-of-order webhooks.
- [ ] Restart the worker during a claim; verify recovery and review evidence.
- [ ] Verify approved, pending, rejected, canceled and refunded test outcomes,
  QR invalidation and unchanged real ledger.
- [ ] Validate owner-only UI, organization switching, expired codes and
  stale receivable state in the browser.
- [ ] Confirm provider API capabilities, event signature behavior, fees,
  settlement account and operational recovery with the actual application.

## Production activation remains blocked

Phases 4.5.7 and 4.5.8 implement the internal live reservation/charge binding
and separate authenticated live settlement inbox. See
[Live Pix issuance](mercado-pago-live-pix-issuance.md) and
[Live settlement](mercado-pago-live-settlement.md). Do not set live payment
flags or accept real Pix based on this checklist alone. Safe live QR/status
presentation, uncertain-create recovery, credential continuity and operational
review for unmatched, late, refunded or charged-back payments must be
completed and externally homologated. A failure or disconnect
must stop new issuance without silently dropping already received payments.
Require a separate operator-controlled pilot, authorization and feature gates
before any live activation. Static Pix/manual recording stays independent.

For rollback, keep live issuance disabled; never delete payment bindings or
webhook review rows to force another charge. No automated refund or reversal
is enabled.
