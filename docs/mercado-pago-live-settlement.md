# Phase 4.5.8 — live payment confirmation and receivable settlement

Apply migration `20261127010000_add_mercado_pago_live_webhook_inbox` and regenerate
Prisma. No new dependencies or frontend changes. The production inbox and
worker are separate from sandbox, and their flags default to false.

```dotenv
MERCADO_PAGO_LIVE_WEBHOOK_ENABLED=false
MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED=false
MERCADO_PAGO_LIVE_PIX_ENABLED=false
```

For a future operator-controlled deployment, intake additionally requires
enabled Mercado Pago in live mode and the live application's independently
configured `MERCADO_PAGO_LIVE_WEBHOOK_SECRET`. Register the payment topic at
`POST /api/receivables/webhooks/mercado-pago/live` on the API's public HTTPS
origin. Keep the sandbox route and credentials separate. Worker activation
requires intake; intake can retain events while the worker is stopped.
Do not enable these switches before external homologation. The existing
issuance flag still fails startup if true; live recovery, presentation and
operator approval are not implemented in this increment.

## Processing and financial guarantees

- Verify the signed URL/header manifest using the existing constant-time
  HMAC policy and the live secret. Ignore caller body fields; persist signed
  metadata before acknowledgement. No live notification is routed through
  the sandbox worker.
- Claim application-scoped live events using PostgreSQL SKIP LOCKED and a
  two-minute lease. Backoff starts at 30 seconds, capped at one hour.
  Unmatched/unavailable events are retained for review after 25 attempts.
- Resolve the exact immutable live reservation plus linked provider charge.
  Never search other seller credentials or infer a seller from a notification.
  Verify the original owner and matching current live connection. Fetch the
  bound payment outside the database transaction, validating ID, reference,
  seller, mode, exact BRL amount, Pix method, status, refund amount and
  approval date. A create response is never a settlement.
- Under the organization write lock, lock and validate the event lease,
  recheck the complete binding and current connection, and invoke the shared
  existing ledger confirmation transaction. Approval, ledger entry,
  receivable version/balance, charge evidence, issuance state and event
  disposition commit together. A failed/expired completion rolls back all
  writes; repeated deliveries cannot create another ledger entry.
- The generic Mercado Pago confirmation path refuses application; the live
  worker alone can invoke the shared settlement transaction for Mercado Pago.
  Other providers retain their existing generic behavior. Subscription
  expiry alone does not prevent an already received valid payment from
  being accounted for.
- A verified closed payment hides the QR; a settled payment becomes SETTLED.
  Pending events cannot restore terminal states. Refunds, chargebacks,
  stale snapshots, mismatches, owner changes, late approvals after closure
  and ledger conflicts retain sticky review evidence. They never automatically
  reverse or reapply a recorded payment. Preserve the original creation
  resultCode and the first settlementReviewCode on the live reservation.

## Operator review and remaining release gates

Inspect the scoped live inbox resultCode, reviewRequiredAt, matchedIssuanceId
and the reservation's settlementReviewCode using restricted database access.
Phase 4.5.9 adds owner-initiated live recovery and gated QR/status UI; see
[Live Pix review](mercado-pago-live-pix-review.md). No automatic replay/reset
or manual review override is provided. A missing provider ID
can only be recovered with authoritative reference/account verification;
never generate another charge or guess a binding. Expired/disconnected
credentials defer processing; no synthetic user session or autonomous token
refresh is performed. Restore the seller connection through the authorized
OAuth workflow. Unprocessed events remain durable.

Keep new collection blocked until recovery and safe presentation are verified,
operational review and credential continuity are completed, and external
provider homologation is approved. No real payments are needed by CI. The disposable PostgreSQL
suite uses mocked provider calls and covers duplicate/concurrent approvals,
rollback/retry, expired leases, sandbox isolation, refund review, late
approval, missing identities, outages and subscription expiry. The transport
and controller tests verify live identity checks and authenticated intake.
Real provider delivery, account setup, settlement fees, QR/payment behavior
and operational review still require a controlled pilot.
