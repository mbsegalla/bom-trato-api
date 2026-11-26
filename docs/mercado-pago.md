# Phase 4.5.2a — Mercado Pago integration client

This increment selects Mercado Pago for professional receivables, separate from
Stripe subscription billing. It provides the internal HTTP client and contract
tests. No route, scheduled job, stored credential, connection UI, payment creation
or webhook is enabled yet.

## Provider contract

- Authorization Code with S256 PKCE and random state. The next owner-only
  onboarding flow must persist a short-lived single-use state bound to the
  organization, owner and session, encrypt the verifier, consume it atomically
  before exchange and revalidate ownership. Only the authorization URL goes to
  the browser; keep the verifier and tokens server-side.
- Exchange and refresh at the fixed Mercado Pago OAuth endpoint. Require an
  explicit test/live mode, matching provider mode, seller ID and the read,
  write and offline_access scopes. A refresh returns both rotated credentials;
  future persistence must protect and replace them atomically.
- Read a payment using the seller access token at the fixed Payments API
  endpoint. Require the expected payment and collector IDs and mode. Only
  approved, accredited, unrefunded Pix bank transfers are candidates for
  confirmation. Convert gross amount to integer cents without rounding,
  preserve the currency and approval date, and discard payer data.
- The lookup is not webhook authentication. A future authenticated, durable
  event handler must establish the event ID and organization/account context
  from trusted records before calling the client, then invoke the existing
  confirmation use case. Pending, refunded and non-Pix events are not successful
  ledger confirmations; do not discard events without a durable disposition.

The transport uses a fixed origin, no redirects, a request timeout, and sanitized
errors. No automatic retries are performed for token exchange or refresh.
The credentials are not logged or returned through a public API.

## References

- [OAuth authorization and PKCE](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation)
- [Token reference](https://www.mercadopago.com.br/developers/pt/reference/authentication/oauth/_oauth_token/post)
- [Refresh](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/renewal)
- [Read payment](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/get-payment/get)

## Next increments

1. Register a Mercado Pago marketplace application and enable PKCE. Implement
   organization-scoped onboarding, encrypted credentials, rotation and disconnect.
   Confirm sandbox capabilities and the exact payment creation API before activation.
2. Create dynamic provider charges with durable idempotency and link them to
   receivables. Keep static Pix available as a separate manual option.
3. Verify webhook signatures, persist and retry events, read authoritative
   payments and apply only matched live confirmations. Handle refunds and
   review-required cases explicitly.

No new migration, dependencies or environment variables are required for this
client. Phase 4.5.1 migration is still required if not already applied.
Contract tests use an injected mock transport; no provider requests, real
payments or sandbox account connections occur during CI. Run the full
`ci/preflight` workflow before promoting.
