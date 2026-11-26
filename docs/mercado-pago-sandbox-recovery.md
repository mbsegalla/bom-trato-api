# Phase 4.5.5 — sandbox payment recovery and review

Apply migration `20261126230000_add_mercado_pago_sandbox_pix_recovery` and
regenerate Prisma. No new dependencies or environment variables. Recovery
requires the existing sandbox Pix opt-in, an authorized original owner,
and the same connected test seller. Do not enable live mode.

GET/POST `/api/organizations/:organizationId/receivables/:receivableId/mercado-pago/sandbox-pix/recovery`
show the latest owner-scoped recovery attempt and verified webhook evidence
or initiate a new check with the existing issuance UUID. POST accepts no
provider payment ID, amount, customer information, or alternate account.
The owner must still have platform access to perform a recovery.

A recovery claim is persisted before provider I/O under the organization
write lock; a two-minute lease and one-minute cooldown prevent overlapping
or repeated searches. An expired claim is preserved as abandoned when the
next claim starts. Finalization requires the same unexpired claim and
revalidates owner/session, seller, application, and immutable reservation.
All attempts remain audit records; no raw provider payload or credential
is saved to this table.

For an existing payment ID, use the authenticated individual GET. Otherwise,
search `GET /v1/payments/search` by the reserved external reference with
limit 2, then independently fetch the single candidate and validate account,
reference, payment ID, BRL amount, Pix method and test mode. Empty, ambiguous,
invalid or unavailable results never authorize another issuance. The
provider search has retention and indexing limits, and a negative result
is not proof that a charge never existed.

Only verified identity can bind a missing payment ID. A collision is held
for review; no existing binding is overwritten. Non-pending, invalid or
ambiguous evidence hides an existing QR; a recovered pending payment with
no existing QR remains held for review. The original immutable reservation
is never deleted, unlocked or replaced. The worker can match subsequent
or still-retryable webhook deliveries once the identity is bound. Exhausted
unmatched events remain historical evidence; no mass replay or automatic
review reset is performed. No real ledger entries or balances are changed.

The owner-facing panel distinguishes the local issuance state, latest
manual check and latest matched verified webhook. Refunds and uncertain
states remain review-only. The panel does not enable refund, cancellation,
automatic live settlement or a replacement payment.

Official provider search reference:
https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/search-payments/get

Tests cover search identity, ambiguous results, pagination, test-mode
isolation, cooldown and lease eligibility. Real PostgreSQL concurrent
claims, provider search behavior, uncertain creation/crash scenarios and
browser acceptance testing remain required. Deploy API before web.
