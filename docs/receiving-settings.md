# Phase 4.2 — customer payment destination settings

The organization owner can manage a separate Pix receiving destination at `GET/PUT /api/organizations/:organizationId/receiving-settings`. These settings are unrelated to the Bom Trato subscription, Stripe billing customer, stored cards and receivable payment records. No public payment page, payment code, transfer, webhook, charge or provider connection is created in this increment.

A verified current owner (both organization owner ID and OWNER membership) can read; writes also require current platform access and no billing reconciliation requirement. Responses use the normal data envelope and private/no-store cache header. Other members cannot read the full destination. One row per organization, write lock and version checks protect concurrent edits; version 0 creates the initial row. Enabling requires the explicit confirmation boolean and all destination fields. Disabling clears the stored key and merchant fields and advances the version, rather than deleting the row. Do not log request/response bodies on these routes.

Pix key formats follow the Banco Central DICT API specification (https://www.bcb.gov.br/content/estabilidadefinanceira/pix/API-DICT.html): CPF, CNPJ (including alphanumeric), PHONE (international + prefix), EMAIL (lowercase, maximum 77 characters) and EVP. This is format validation only; there is no checksum, DICT lookup or verification that the entered key belongs to the owner. The name and city are normalized to ASCII uppercase, limited to 25/15 characters respectively as display labels for a later payment-code increment. The owner must confirm actual account ownership in their bank.

## Deployment

Apply `20261126150000_add_organization_receiving_settings` and regenerate Prisma Client. Set `RECEIVING_SETTINGS_ENCRYPTION_KEY` on the API only to a unique 32-byte random hex secret (64 characters). Generate locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store this value securely, identically across API replicas, and back it up separately from the database. Do not use a frontend/public variable or reuse existing application secrets. Without the variable, the existing application starts normally but this feature is read-only for unconfigured organizations. An existing encrypted destination cannot be read without its original key. The Pix key is stored using AES-256-GCM with a random IV and AAD binding organization ID and key type. Only the owner-only authenticated response contains the plaintext. Merchant display labels and audit metadata are not field-encrypted. Key rotation requires a separately planned re-encryption process; do not replace or lose the secret.

Deploy API before frontend. No new dependency or provider credentials. Validate Prisma, migrations on a disposable database, HTTP authorization/tenant isolation, stale writes, encrypted storage, disabled-state clearing and UI before production use.
