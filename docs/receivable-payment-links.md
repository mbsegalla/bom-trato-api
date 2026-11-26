# Phase 4.4 — payment links

The verified organization owner can create, inspect and revoke a payment link at
`/api/organizations/:organizationId/receivables/:receivableId/payment-link`.
POST requires the current receivable version. A replacement invalidates the old
token. GET returns status and expiry only; DELETE revokes even if subscription
access has expired. The token is generated from 32 random bytes, stored as a
SHA-256 hash only, and returned in the URL fragment once.

The link expires seven days after creation. POST
`/api/public/receivable-payment-links/resolve` accepts the token in the body,
applies the existing database-backed rate limiter with a separate scope, and
rechecks the current owner, subscription, destination, receivable eligibility,
and both versions in one read snapshot. Any change to the receivable or Pix
settings invalidates the link; generate a new link after partial payment.
The response contains only business/display name, outstanding BRL amount,
static Pix instructions and link expiry. No customer identity, internal IDs,
notes, credentials or payment confirmation are returned. Treat the link as a
bearer secret; anyone with it can read the payment instructions.

The page is revocable; previously copied static Pix instructions are not.
No provider integration, automated payment confirmation or payment write occurs.
The customer must confirm recipient and amount with the bank.

Apply migration `20261126160000_add_receivable_payment_links` and regenerate
Prisma Client. No new packages or environment variables; the existing receiving
encryption and share rate-limit secrets are required. Deploy API before frontend.
Verify expiry, replacement, revocation, changed versions, wrong tenant, disabled
owner, billing restrictions, rate limits and response minimization before release.
