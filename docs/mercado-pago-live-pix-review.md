# Phase 4.5.9 — live Pix presentation, recovery and review

Deploy API before web. Apply
`20261127020000_add_live_pix_recovery_and_align_work_order_schema`
and regenerate Prisma. The migration also aligns the legacy checklist index
name and warranty updatedAt default with the Prisma schema. It does not
edit old migrations, remove rows or repair a missing local migration record.

No new application env variables or dependencies. Keep these false until
external homologation and explicit release approval:

```dotenv
MERCADO_PAGO_LIVE_PIX_ENABLED=false
MERCADO_PAGO_LIVE_WEBHOOK_ENABLED=false
MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED=false
```

Live issuance still fails startup if its flag is true. The owner-only
GET/POST live-pix and POST live-pix/recovery endpoints and the web panel
are now implemented. An existing issuance is visible for review even when
new collection is disabled. The pending QR requires live release, active
worker, operating permission, current same-seller credentials, valid bound
charge, unchanged receivable version/balance, valid encrypted QR and expiry.
Only the owner can view it. No public customer payment link is changed.

Recovery requires the live intake/worker switches, original owner with an
active session and operation permission, and the same seller account.
It can use the existing owner-authorized credential rotation flow; no
background refresh grant is added. A persistent two-minute claim and
one-minute cooldown guard concurrent/repeated recovery. For a known
payment ID perform the authoritative read; otherwise search by the
immutable reservation reference and verify the single candidate via GET.
No negative or ambiguous result authorizes a new charge.

On an exact verified missing identity, bind the original snapshot and
preserve the creation result with recoveredAt. No replacement QR is
created. Apply the same financial settlement routine as the live webhook
worker only after validating the claim and connection under the organization
write lock. Recovery evidence has its own durable audit record, distinct
from signed webhook deliveries. A successful approval updates the ledger,
reservation and recovery record atomically; a concurrent approval can only
be applied once. Sticky review remains for refunds, mismatches, stale
snapshots and other conflicts. A recovered pending payment is held without
a new QR. Do not reset a review or create another charge.

The owner-facing panel shows local status, latest reconciliation result
and matched webhook outcome. No manual review override, automatic refund,
or live credential continuity daemon is added. Exhausted unmatched signed
events remain retained for operator review, even after a recovery settles.

Mock-provider and disposable PostgreSQL tests cover the new admission,
search, recovery/rollback and presentation invariants. External provider
homologation, browser acceptance, credential continuity and operational
resolution remain release prerequisites. Never enable live collection
solely because the automated CI passes.

For local databases receiving committed migrations, use
`pnpm exec prisma migrate deploy` and `pnpm prisma:generate`.
A local migration recorded in _prisma_migrations but missing from disk
still requires restoring its original SQL or rebuilding a disposable
development database after preserving needed data. Do not edit applied
migration checksums or reset a database containing needed data.
