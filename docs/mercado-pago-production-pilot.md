# Phase 4.5.10 — controlled production pilot and external homologation

This release implements a bounded production pilot; it does **not** assert
that the Mercado Pago application was externally homologated. CI uses a
disposable PostgreSQL database and fake provider responses. No live
credentials, seller/payer data, production deployment, charge, or money
movement is part of this change.

## Release gate

Deploy the latest API and frontend revisions after their functional CI checks
pass. The schema must include all previous migrations (including live
recovery in phase 4.5.9). This increment adds no migration or dependency.
For an existing development database apply committed migrations with
`pnpm exec prisma migrate deploy`, then `pnpm prisma:generate`.
A missing applied local migration still requires repairing local history
without deleting needed data.

The application defaults to no live collection. Keep the following
configuration until the release checklist is completed and signed off:

```dotenv
MERCADO_PAGO_LIVE_PIX_ENABLED=false
MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED=false
MERCADO_PAGO_LIVE_WEBHOOK_ENABLED=false
MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED=false
```

The new optional approval/organization/account/amount settings are not
required for ordinary local or sandbox use. Production issuance requires
NODE_ENV=production, Mercado Pago enabled in live mode, HTTPS frontend,
the live webhook intake and worker, explicit operator attestation and
one exact approved organization UUID plus one connected seller account ID.
The amount limit must be set explicitly in integer cents (1 to 10000).
Only one unresolved live reservation (reserved, pending or review) may
exist per organization; an uncertain creation blocks further issuance
even on other receivables. The organization lock serializes these checks.
The existing reservation, account binding and receivable version are
never reset to make a new charge.

Only after completing external test homologation, reviewing operational
risks and obtaining explicit approval for the first real pilot payment:

- Configure production app credentials, encryption key and separate webhook
  secret in the deployment secret manager; never commit them.
- Register the exact HTTPS frontend callback /mercado-pago/callback and
  API webhook /api/receivables/webhooks/mercado-pago/live for the payment
  event. Verify signed deliveries on the intended application.
- Set MERCADO_PAGO_ENABLED and MERCADO_PAGO_LIVE_MODE to true. Keep all
  sandbox switches false in this deployment.
- Set the live intake and worker switches true. Confirm the intake works
  before enabling issuance.
- Set MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID to the authorized organization
  UUID, MERCADO_PAGO_LIVE_PILOT_ACCOUNT_ID to its authorized seller ID, and
  MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS to the approved limit.
- Record the operator, date, application identity, organization and seller,
  completed checklist, and approval in the deployment change record.
  Only then set MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED and
  MERCADO_PAGO_LIVE_PIX_ENABLED to true. These flags are an operator
  attestation, not automated proof of homologation.

Do not broadly enable the service for other customers. Verify the first
authorized low-value pilot payment in both provider and platform, including
the gross receivable amount, provider fees, net amount and actual seller
account. Do not share another payment link, static QR or payment channel
for the same receivable during the pilot. Pause new issuance after the
first transaction until results have been reviewed.

## External acceptance checklist (all items pending until evidenced)

- [ ] Deploy isolated test environment with HTTPS, test credentials and
  test seller/buyer. No real payer data.
- [ ] Verify app OAuth authorization, offline_access scope, authorized
  owner, disconnect/reconnect and token rotation.
- [ ] Issue sandbox payment; verify immutable reference, currency, amount,
  account, QR, expiry, retry and no double POST after a timeout.
- [ ] Test payment notifications: correct signature, wrong signature,
  duplicate delivery, worker restart, pending/approved/closed/refunded
  outcomes and no real ledger mutation in test mode.
- [ ] Verify unknown/mismatched identities, expired credentials and
  reference recovery, including no reissue after empty search.
- [ ] Verify mobile/browser behavior, tenant separation, active session,
  current version, QR expiry, copy and automatic status refresh.
- [ ] Confirm the selected API and production application support the
  actual request/response fields and payment-topic signature, verify
  the fee schedule, consent/privacy, seller account and funding path.
- [ ] Review test evidence, previous/current CI, rollback and incident
  procedure; confirm support owner and explicit first-pilot approval.
- [ ] During the separately authorized live pilot, verify one real
  payment with a consenting payer: provider status, seller receipt,
  exactly one linked ledger entry, receivable balance, duplicate
  notifications and hidden paid QR. Stop issuance on any discrepancy.

Record result, date, environment, provider/application reference and
operator for each item. Do not include secrets or payer documents in
test evidence. Passing CI does not complete external acceptance.

## Credential continuity

The OAuth client accepts credentials only with read, write and
offline_access scope. A leased notification with an exact live
reservation/charge and the original verified owner can renew a
still-valid near-expiry seller grant even after the owner session or
subscription expires. The worker never rotates for unbound IDs, other
accounts, disconnected sellers, ownership changes, active OAuth or
expired grants. It claims rotation under the same organization lock
as the owner flow; on failure it retains the claim and requires
authorized reconnection rather than repeating an uncertain grant.
Both new encrypted tokens are saved by compare-and-set before any
further payment lookup. A stale notification lease cannot mutate the
ledger. No proactive refresh daemon is added; the seller may still
need to reconnect when a grant has expired before a delivery arrives.

Reference: https://www.mercadopago.com.br/developers/pt/docs/security/oauth/renewal

## Incident and operational review procedure

If any result is uncertain, mismatched, refunded, charged back, or the
provider/account/credentials change, turn off new issuance first:
MERCADO_PAGO_LIVE_PIX_ENABLED=false. Leave live mode, intake, worker,
application identity, encryption key and webhook secret available to
finish existing deliveries; never roll back by dropping tables or
switching the same process to sandbox. Stopping the UI does not cancel
a QR already delivered. In an emergency follow the provider's supported
cancellation/refund process, not a database edit.

Use the receivable's reconciliation panel to consult its existing
reference. Record the outcome in an access-controlled incident/change
record, including immutable reference, payment ID (when verified),
provider status, financial evidence, action and operator. For unknown
events use read-only operations queries below; never query arbitrary
seller accounts. No public administrative retry, review reset or manual
settlement override is introduced. Unresolved or exhausted events
remain durable; after a reconnect use the owner recovery action on
the original issuance. If there is still a mismatch, confirm directly
in the seller dashboard and escalate to an authorized financial
operator. A reversal/refund must be reconciled by the operator against
provider evidence and existing manual ledger procedures; do not create
another real charge while review is unresolved. The pilot intentionally
stops in sticky review states. A general self-service exception-resolution
workflow is outside this pilot.

Use a restricted database reader, with no access to raw tokens or payer
information. Run queries only in the intended environment; filter to the
approved application and pilot organization:

```sql
BEGIN READ ONLY;

SELECT "clientId", "resultCode", count(*) AS events,
       min("receivedAt") AS oldest_received
FROM "MercadoPagoLiveWebhookEvent"
WHERE "clientId" = '<approved application ID>'
  AND "processedAt" IS NULL
GROUP BY "clientId", "resultCode"
ORDER BY oldest_received;

SELECT p."id", p."receivableId", p."status", p."resultCode",
       p."settlementReviewCode", p."externalPaymentId",
       p."amountInCents", p."recoveredAt", c."paymentId",
       c."reviewReason"
FROM "MercadoPagoLivePix" p
LEFT JOIN "ReceivableProviderCharge" c ON c."id" = p."providerChargeId"
WHERE p."organizationId" = '<approved organization UUID>'::uuid
  AND p."clientId" = '<approved application ID>'
ORDER BY p."createdAt" DESC;

SELECT "organizationId", "expiresAt", "refreshStartedAt", "disconnectedAt"
FROM "MercadoPagoConnection"
WHERE "liveMode" = true
  AND "organizationId" = '<approved organization UUID>'::uuid
  AND "clientId" = '<approved application ID>';

COMMIT;
```

Never expose operational query output to unrelated tenants. Review
backlog and credential status throughout the pilot, and preserve
records according to existing retention/security policies. Roll back
new collection by disabling its gate, not by deleting financial
evidence. A wider release requires a separate approved rollout,
review resolution tooling and measured provider/pilot results.
