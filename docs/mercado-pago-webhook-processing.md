# Phase 4.5.4b — sandbox webhook processing and reconciliation

Apply migration `20261126220000_process_mercado_pago_webhook_inbox` and regenerate Prisma.
No dependencies or frontend changes. Keep both webhook features disabled until
testing in a segregated environment. The worker has an independent opt-in:

```dotenv
MERCADO_PAGO_ENABLED=true
MERCADO_PAGO_LIVE_MODE=false
MERCADO_PAGO_WEBHOOK_ENABLED=true
MERCADO_PAGO_WEBHOOK_SECRET=<test application signature secret>
MERCADO_PAGO_WEBHOOK_WORKER_ENABLED=true
```

The existing intake continues to deduplicate signed deliveries. A bounded
batch runs every 15 seconds. Claims use PostgreSQL `FOR UPDATE SKIP LOCKED`
and a two-minute lease, scoped to the configured application. Completion
requires the same unexpired lease; a crash leaves the event recoverable.
Retries back off from 30 seconds to one hour and enter durable review after
25 completed attempts. All rows, including unmatched and ambiguous events,
are retained. Inbound delivery and provider calls are independent.

Only a unique durable sandbox issuance with matching application and payment
ID can be reconciled. The worker obtains the original seller's current
sandbox token after verifying the owner, connection, and absence of an
ongoing OAuth/refresh attempt. It does not impersonate a user session or
perform a refresh grant. Expired/near-expiry credentials defer processing;
the owner must restore the connection with OAuth or an owner-authorized
refresh. Never iterate other organizations' credentials to find an account.

The provider is queried with GET /v1/payments/:id, outside a transaction.
The response must match the reservation ID (external reference), seller,
payment ID, gross BRL amount, Pix method and sandbox mode. Pending, approved,
closed and refund outcomes are normalized without storing raw provider
payloads. Inconsistent data is held for review. Finalization rechecks the
binding and connected seller under the organization write lock. A non-pending
verified outcome hides the old QR by transitioning a pending issuance to
REVIEW_REQUIRED and clearing its encrypted code; the verified result is
retained in the inbox resultCode (e.g. VERIFIED_APPROVED). The event and
issuance change commit atomically. Later pending events cannot reopen or
reissue a reviewed reservation. Refunds and ambiguous statuses require
review rather than an automatic reversal. No receivable version, balance,
ReceivablePayment, live charge or provider confirmation use case is mutated.

Operators can inspect attempts, resultCode, matchedIssuanceId,
processedAt and reviewRequiredAt in the inbox using restricted database
access. No review UI or manual retry endpoint is included yet. Payments for
uncertain creations whose external payment ID was never saved cannot be
attributed from a notification alone; they remain unmatched and require a
future authoritative external-reference search/recovery workflow. Do not
delete a reservation or reset it to issue another charge. Do not enable live
mode: automatic live settlement, recovery of uncertain issuance, operational
review, and real sandbox/provider and PostgreSQL concurrency homologation
remain outstanding.

Tests cover authoritative provider identity, mode/amount/refund handling,
processor orchestration, failed leases and retry disposition. CI checks schema,
migration, typecheck, tests and build; actual webhook delivery and database
lease/crash behavior require integration testing before activation.
