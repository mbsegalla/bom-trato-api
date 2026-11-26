# Phase 4.5.3b — owner-only sandbox Pix issuance

The sandbox issuance endpoint is deliberately independent of real financial
confirmation. Enable it only in a segregated test deployment with a Mercado
Pago test seller connection, test buyer data, and test receivables:

```dotenv
MERCADO_PAGO_ENABLED=true
MERCADO_PAGO_LIVE_MODE=false
MERCADO_PAGO_SANDBOX_PIX_ENABLED=true
```

The new flag defaults to false; enabling it with live mode or disabled OAuth
is invalid. Do not use actual customer CPF/CNPJ or emails for test issuance.
The provider's current sandbox capabilities and seller eligibility need
real homologation; CI uses no external payment API.

GET and POST
`/api/organizations/:organizationId/receivables/:receivableId/mercado-pago/sandbox-pix`
require the verified owner. Creation additionally requires current platform
access, a valid session and a matching current connected seller, receivable
version and positive BRL balance. POST requires explicit confirmation and
test buyer email/document. The server chooses the amount and one-hour expiry.
The buyer data is transmitted to the provider, not persisted in the issuance
table or included in responses. Redact request bodies in all access logs.

One immutable reservation per receivable is committed under the organization
write lock before a provider request. Its UUID is both idempotency key and
external reference. Concurrent or repeated submissions reuse the existing
reservation; no new provider request is made. A failed/uncertain network call,
non-pending response, malformed QR, or interrupted finalization needs review.
The provider outcome and encrypted QR are persisted in a separate sandbox
table. A reserved row older than two minutes is shown as review-required,
not released for retry. No real ReceivableProviderCharge or ledger payment
is created. A current pending QR is only offered when seller, owner, balance,
version, access and expiry still match. Validate TLV structure, CRC, dynamic
Pix template, BRL and the amount when encoded; the provider response remains
the source of the expected gross amount.

A disconnected or edited receivable cannot reveal its old code on a new
read. This does not revoke a code already seen or an in-flight remote
request. The UI is for the owner, not for sharing with customers. No public
payment page, actual payment confirmation, cancellation, or repeat issuance
is available. Expired, stale and uncertain attempts remain locked. A later
reconciliation increment must search the original UUID/account at Mercado
Pago and verify the outcome before permitting a replacement. Never delete
a reservation to work around uncertainty. The provider integration is not
production-ready until authenticated webhooks, reconciliation, and testing
are complete.

Apply migration `20261126200000_add_mercado_pago_sandbox_pix` and regenerate
Prisma. No new dependencies. Tests cover balance, status and QR policy; real
sandbox calls, PostgreSQL concurrency/crash recovery and browser acceptance
testing remain required.
