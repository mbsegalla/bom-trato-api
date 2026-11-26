# Phase 4.5.1 — provider payment confirmation foundation

Static Pix codes and the existing payment links are not bank-confirmed payment
objects. The subscription Stripe customer and webhook must not be used for
customer receivables. No provider is selected or connected by this change.

The internal `ConfirmReceivableProviderPaymentUseCase` offers two operations:

- `register`: a trusted payment creation adapter binds a provider account and
  provider payment ID to an owner-authorized receivable, its current version
  and exact remaining BRL amount. A repeated registration must match the
  original organization, receivable, actor, version and amount.
- `execute`: a trusted webhook adapter supplies a verified final live Pix
  payment. The adapter must authenticate the webhook, retrieve the current
  authoritative payment from the correct connected account, validate the
  payment method and final status, and normalize gross amount to integer cents.
  Do not construct the confirmation directly from untrusted webhook fields.

The unique provider/account/payment identity is looked up before determining
the organization. The confirmation is re-read under the existing organization
write lock. The existing receivable aggregate and payment repository are used
to apply the payment; payment creation, version advancement and the binding
record are committed in one transaction. The registered owner's ID is the
audit actor for the system operation and the payment note marks its origin.
The confirmation is not gated on subscription expiry: a legitimately settled
payment must still be accounted for. An ownership change requires review.

Duplicate deliveries cannot create another payment, including after a manual
reversal. A changed amount, currency, receivable version, ownership, status or
request ID collision is recorded for manual review, with the first verified
confirmation evidence preserved. A review is sticky; retries cannot silently
apply it. A sandbox notification is ignored and an unregistered payment is
reported as unmatched. The future durable webhook inbox must retain and retry
unmatched events rather than acknowledging and discarding them.

## Scope and remaining integration

There is no HTTP webhook route, worker, external API call, new frontend
control, provider credential or real payment activation in this increment.
Only internal code can call the use case; there are no provider charge rows
created by the existing static Pix endpoints. Registration must be completed
before instructions are given to customers. The next adapter must implement
per-organization provider onboarding, creation idempotency, authenticated
notifications, durable event handling and a review workflow, including late
payments, refunds and chargebacks. Do not automatically reverse ledger entries
based on provider events until that workflow is implemented.

Apply migration `20261126170000_add_receivable_provider_charges` and regenerate
Prisma Client. The migration adds a binding table and scoped relations; there
are no new dependencies or environment variables. Before enabling any provider,
test concurrent delivery, rollback, cross-organization binding, account and
mode mismatches, manual payment races and provider sandbox behavior.
