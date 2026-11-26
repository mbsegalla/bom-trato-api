# Phase 4.5.7 — isolated live Pix issuance foundation

Apply migration `20261127000000_add_mercado_pago_live_pix_reservation` and
regenerate Prisma. No new dependencies or frontend changes.

```dotenv
MERCADO_PAGO_LIVE_PIX_ENABLED=false
```

The flag is optional and defaults to false. **Setting it to true intentionally
fails application startup in this increment**. The application does not have
a live webhook/settlement and operational recovery adapter yet. There is no
HTTP endpoint, public QR, scheduled live issuer or customer payment button.
Only the internal issuance use case and provider adapter are implemented and
tested with fixtures. Do not enable real collection or use real buyer data.

## Reservation and identity

- Require a verified organization owner, operating permission, active session,
  explicit confirmation, exact receivable version/balance in BRL and matching
  live seller credentials. Recheck the current token under the organization lock.
- Reserve one immutable live issuance per receivable, separate from sandbox.
  Do not issue if an existing provider charge already exists for that receivable.
  A repeated request returns the reservation and never performs another POST.
- Commit the reservation before provider I/O. Use the same UUID as the
  idempotency key, external reference and real provider-charge identifier.
- Send only the authorized payer fields to the fixed Payments API. No payer
  fields, raw provider responses, credential or plain QR are persisted. No
  commission is added. Reject test/live, seller, reference, currency, amount
  and method mismatches.
- Atomically create the real provider-charge binding and finalize the live
  reservation using the original version/amount/actor snapshot. Validate the
  current connection, receivable and QR before encrypting a pending code.
  Never expose that code to the customer in this phase.
- A timeout, invalid response, crash, duplicate identity or changed snapshot
  requires review. Preserve the reservation even if no provider ID was saved.
  Never reset or reissue based on an empty search or elapsed time. A stale
  snapshot must not silently apply to the real ledger. A creation response,
  including an apparent approval, never records a real payment.

## Required before enabling live issuance

Phase 4.5.8 adds the separate live webhook inbox, authoritative payment
lookup and transactional ledger confirmation; see
[Live settlement](mercado-pago-live-settlement.md). The live issuance flag
remains blocked. Complete recovery of live uncertain creations, credential
continuity/reconnection, pending QR read guards, owner-facing presentation,
operational review and a controlled operator pilot. Keep live issuance and
settlement independently disableable; stopping new charges must not discard
existing notifications. Never automatically reverse refunded charges.

Remove the startup block only after the complete path and actual Mercado Pago
sandbox/provider homologation have been verified. No real payment or live
credential is used by the automated tests.
