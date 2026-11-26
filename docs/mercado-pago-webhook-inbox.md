# Phase 4.5.4a — authenticated Mercado Pago webhook inbox

This is a sandbox-only intake increment, not a settlement adapter. It is
disabled by default and must not be enabled in live mode. It does not change
receivables, expose payments to customers, or call the payment API.

Apply migration `20261126210000_add_mercado_pago_webhook_inbox` and regenerate
Prisma. No new dependencies. In a segregated test deployment:

```dotenv
MERCADO_PAGO_ENABLED=true
MERCADO_PAGO_LIVE_MODE=false
MERCADO_PAGO_WEBHOOK_ENABLED=true
MERCADO_PAGO_WEBHOOK_SECRET=<secret signature from the Mercado Pago application>
```

Keep the actual webhook secret out of source control and logs. It is different
from the OAuth client secret. Configure the payment event topic in the test
application with the public HTTPS endpoint:

`POST /api/receivables/webhooks/mercado-pago`

The receiver requires the signed numeric `data.id` URL parameter,
`x-request-id` and `x-signature`. It validates HMAC-SHA256 over the official
manifest using a constant-time comparison. Both documented timestamp units
are accepted. Future timestamps have a five-minute tolerance. Historical
signed deliveries remain admissible to support retries after an outage; exact
signed manifests are deduplicated indefinitely by a database key scoped to
the application. Do not delete these records without a replay-retention policy.

Only signed metadata is stored. The body, payer information, signature and
secret are not persisted; even a genuine signature does not authenticate
body fields such as seller, amount, status, or live mode. The configured
webhook should subscribe only to payment notifications. No account is
selected on the basis of an untrusted body or query field. A notification is
acknowledged only after the database insert (or exact duplicate) succeeds.

The next increment must implement leased/retryable processing and match a
durable payment binding or sandbox issuance, fetch the authoritative payment
with the correct seller's credentials, validate the external reference,
account, amount and mode, and retain unmatched or ambiguous events for review.
Sandbox payment results must never alter the real ledger. Live issuance and
automatic settlement remain disabled until reconciliation and homologation
are complete. Refunds and chargebacks require a separate review workflow.

Official signature documentation:
https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications

Unit tests cover signed manifest verification, tampering, timestamp units,
exact retry keys and ambiguous parameters. Test actual provider delivery,
database deduplication/concurrency, HTTP response handling and outage retries
before enabling the flag. The inbox has no processing worker in this step.
