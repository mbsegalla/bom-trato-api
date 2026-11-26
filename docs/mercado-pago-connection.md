# Phase 4.5.2b — seller account connection

The feature is disabled by default. Only a verified owner with current platform
access can start/complete OAuth. Read and local disconnect require a verified
owner, but not a paid subscription. Endpoints:

- GET/DELETE /api/organizations/:organizationId/mercado-pago/connection
- POST /api/organizations/:organizationId/mercado-pago/connection/start
- POST /api/mercado-pago/connection/complete (authenticated; state determines organization)

The frontend callback is the fixed HTTPS origin from FRONTEND_URL plus
`/mercado-pago/callback`. Register this exact URL in Mercado Pago's application
settings, enable Authorization Code with PKCE S256, and grant read, write and
offline_access. Start in test mode. No provider app or account is created by
this change.

The attempt is scoped to the initiating organization, owner, authenticated
session, application ID and mode. A new start replaces the prior attempt.
Only SHA-256 of the random state and an encrypted verifier are persisted.
The attempt expires in ten minutes; the verifier is cleared and state consumed
under the organization write lock before exchange. External exchange occurs
outside the retryable transaction. A second lock revalidates session, owner,
platform access, state, mode and expiry before persisting credentials. Replays,
replacement, disconnect and session revocation cannot finalize an old attempt.
After a failed or uncertain exchange, start OAuth again; do not retry a used code.

Access/refresh tokens are encrypted with AES-256-GCM under a dedicated key,
with authenticated data binding organization, application, mode, seller and
token purpose. Only account ID, status, dates and mode are returned; neither
token nor verifier is returned by the API. Do not log OAuth request bodies,
response bodies or callback query strings. Configure proxy/hosting log redaction.

Each organization has one reserved seller account per environment; a seller
account cannot be bound to a second organization in the same mode. Reconnect
the same account. Changing accounts is deliberately blocked until there is a
historical-payment reconciliation workflow. Disconnect cancels the outstanding
attempt for that mode and clears the local tokens without deleting the reserved
identity. It does not revoke provider consent; the seller must revoke the app
in their Mercado Pago account separately if desired. Owner or app changes
require a new authorization. The separate test/live records are selected by the
server configuration; switch mode only as a deliberate deployment operation.

## Deployment

Apply `20261126180000_add_mercado_pago_connections` and regenerate Prisma.
No new dependencies. Existing installations remain usable without enabling this.

API-only configuration:

```dotenv
MERCADO_PAGO_ENABLED=false
MERCADO_PAGO_LIVE_MODE=false
# Set these before enabling:
MERCADO_PAGO_CLIENT_ID=
MERCADO_PAGO_CLIENT_SECRET=
MERCADO_PAGO_ENCRYPTION_KEY=
```

Omit the three unset variables (do not set empty strings). Generate a unique
32-byte hex key with Node's crypto randomBytes(32). Keep it stable across
replicas and deployments; never use the Pix, auth or notification keys.
Set the exact HTTPS frontend origin and configure the same callback in the
Mercado Pago dashboard before enabling. Deploy the API before the frontend.

## Scope and validation

No dynamic charges, real payment, webhook, scheduled renewal or financial
ledger write is activated. The subsequent internal credential renewal and
sandbox transport are documented in [dynamic Pix](mercado-pago-dynamic-pix.md).
Reauthorize manually if a credential rotation becomes uncertain; complete
deauthorization handling before enabling charge creation. Provider grant revocation and token validity are not checked live by
the status endpoint. No payment acceptance is implied by CONNECTED.

Unit tests cover state binding, expiration, replay-state transitions and cipher
separation. Before production, test the real sandbox consent, session refresh,
wrong owner/session, concurrent starts/callbacks/disconnect, account uniqueness,
failed exchange, encrypted storage, proxy logging and browser return flow.
