# Phase 4.5.3a — credential rotation and sandbox Pix transport

This increment prepares the internal backend building blocks for provider-issued
Pix. It does not add a public endpoint, a payment button, a real charge, a new
payment link, a worker, a platform commission or a ledger update.

## Seller credentials

The internal `MercadoPagoCredentialService.accessForOwner` requires the
verified owner, current platform access, active session, matching application,
seller, organization and mode. It reuses a credential more than five minutes
from expiry. Near or past expiry it claims renewal persistently under the
organization write lock, then calls OAuth outside the retryable transaction.
Both returned encrypted tokens and the expiry are replaced atomically with a
compare-and-set on that exact claim. Reconnect/disconnect/ownership changes
cannot be overwritten by a stale result.

A timeout, crash, mismatched response or failed finalization can leave a claim.
The old refresh token may already have been spent. Never reuse either stored
credential or retry an uncertain refresh automatically. Require new OAuth;
allow an explicit reconnection after a two-minute cooldown. This cooldown is
not a provider guarantee that an uncertain request completed. A successful
OAuth completion clears the claim. Existing disconnection still clears local
tokens. A future issuance flow must independently revalidate the owner,
session, connection and receivable before reserving a charge; possession of a
token is not authorization to charge.

## Sandbox payment transport

`MercadoPagoClient.createSandboxPix` uses the seller's access token at
`POST /v1/payments`, requires a persisted issuance UUID as the idempotency key
and external reference, sends the exact amount in cents converted to BRL,
explicit expiration, and the test buyer's email and document. The provider
requires these buyer fields; never invent real customer information.
No `application_fee` or other platform fee is sent. The caller must reserve
the immutable request before calling the transport. This method rejects live
mode before network I/O and rejects mismatched seller, mode, amount, currency,
reference, or payment method. A non-pending result is for review, not a
confirmation. Return only the normalized payment identity, pending QR string
and expiry, not payer details, raw provider JSON or base64 images.

The QR string has a basic format check; a future issuance/public presentation
must validate the complete payload and never show an expired or stale charge.
There is no automatic retry. An uncertain create result requires durable
reconciliation by the original issuance reference and provider account before
another charge can be issued. Idempotency does not justify generating a new
UUID on error. The next increment implements this reservation, persistence,
reconciliation and safe owner-facing sandbox UI. No caller invokes the create
or refresh operation in this increment. Keep live issuance blocked until the
webhook, durable inbox and reconciliation workflow have been tested.

## Deployment and verification

Apply `20261126190000_add_mercado_pago_refresh_claim` and regenerate Prisma.
This adds two nullable claim fields; no new environment variables or
dependencies are needed. Existing OAuth and static Pix continue to work.
Unit tests exercise the refresh decision and mocked provider transport.
A PostgreSQL concurrency/rollback test and real sandbox homologation are
still required before enabling issuance.

Official references:
- [Pix via Payments API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix)
- [OAuth token renewal](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/renewal)
