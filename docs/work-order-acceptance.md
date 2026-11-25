# Work order completion acceptance

The existing customer portal can record explicit acceptance after a work order reaches `COMPLETED`. The customer enters a name and agrees to the displayed statement. The server records the time, the source share, the consent text and version, and an immutable copy of the service description presented for acceptance.

The feature does not change the work order status or version, settle receivables, approve a quote, send notifications, or create a review. Work orders remain terminal after completion; this release adds no reopening action.

## Deployment

Run `pnpm exec prisma migrate deploy` and `pnpm prisma:generate` before deploying the API, then deploy the frontend. Migration `20261125210000_add_work_order_acceptance` adds the acceptance table and a composite share index. Existing work orders and shares need no backfill. No environment variables, dependencies or storage buckets are added.

## Public API

All routes use the existing response/error envelopes, private token in the JSON body, share rate limit, expiry/revocation validation, and privacy headers. Tokens are not accepted through query parameters.

`POST /api/public/work-orders/resolve` adds:

```json
{
  "acceptance": {
    "canAccept": true,
    "snapshotHash": "<64 lowercase hexadecimal characters>",
    "consentVersion": "1",
    "consentText": "Confirmo que os serviços descritos nesta ordem foram concluídos e registro meu aceite da conclusão.",
    "receipt": null
  }
}
```

`canAccept` requires a completed work order with a completion timestamp, active organization platform access, and no recorded acceptance for that completion. It is false during billing reconciliation. Otherwise the portal remains readable through a valid share. The snapshot hash is null whenever acceptance is unavailable or already recorded.

Submit `POST /api/public/work-orders/acceptance`:

```json
{
  "token": "<private share token>",
  "snapshotHash": "<hash returned by resolve>",
  "signerName": "Maria da Silva",
  "consent": true,
  "consentVersion": "1"
}
```

The name is trimmed and whitespace is collapsed, with 2–100 characters after normalization. Consent must be the boolean `true`; the consent version must be a string. Clients cannot supply timestamps, organization/work-order/share IDs, consent text or a snapshot. The server builds the snapshot itself.

Both a successful first submission and an exact retry return status 200 with only:

```json
{
  "acceptedAt": "2026-11-25T18:00:00.000Z",
  "completedAt": "2026-11-25T16:00:00.000Z"
}
```

The same two fields appear under `acceptance.receipt` on later resolves, including after platform access expires. Public responses never include the signer's name, acceptance ID, source share, or historical snapshot. A previously recorded receipt is considered current only when both `completedAt` and the work order version still match, and the order is still completed.

## Internal evidence

`GET /api/organizations/:organizationId/work-orders/:workOrderId/acceptance` returns `{ "receipt": null }` before acceptance or `{ "receipt": { ... } }` for the current completion. Verified members can read it even without active platform access and during billing reconciliation. Tenant and work order scope are checked before evidence is returned.

The private receipt contains `id`, `signerName`, `acceptedAt`, `completedAt`, `workOrderVersion`, `consentVersion`, `consentText`, `snapshotHash` and `snapshot`. It omits the internal source-share reference and tenant identifiers.

Snapshot schema version 1 has this shape:

```json
{
  "schemaVersion": 1,
  "organizationName": "Oficina Bom Trato",
  "workOrder": {
    "title": "Manutenção da instalação",
    "currency": "brl",
    "subtotalInCents": 12000,
    "discountInCents": 2000,
    "totalInCents": 10000,
    "completedAt": "2026-11-25T16:00:00.000Z",
    "version": 4,
    "items": [
      {
        "name": "Instalação",
        "description": "Ajuste e revisão",
        "unit": "SERVICE",
        "quantityInThousandths": 1000,
        "unitAmountInCents": 12000,
        "totalInCents": 12000,
        "position": 0
      }
    ]
  }
}
```

The projection uses an explicit allowlist. It excludes customer contact/name, service address, instructions, execution notes, assignee information, schedule/timeline, payment balances, photos, checklist items, storage identifiers and tokens. Monetary values identify the service as described; the acceptance does not record payment or discharge outstanding amounts.

## Snapshot and lifecycle

The SHA-256 precondition covers a server-built JSON projection with fixed field order, the snapshot schema version, and the consent version and text. A change to the service snapshot or consent between resolve and submission causes a conflict. For example, renaming the organization before the first acceptance requires a fresh resolve. The hash is a concurrency precondition; it does not authenticate a person's identity.

After acceptance, the stored snapshot and original timestamps are never replaced by the application. A later organization rename does not alter the record or prevent an exact retry of the original submission. Photos and checklist items remain separately editable and are outside this acceptance's scope.

The table has one record per `(workOrderId, completedAt)`, retains the accepted work order version, and has composite foreign keys for the organization/work order and source share. The repository only supports reading and creating evidence; there is no update, delete or revoke-acceptance endpoint. Revoking or replacing a portal share does not remove evidence. A future reopening feature must preserve old records and establish a new completion/version before requesting another acceptance; it cannot reuse an earlier receipt.

The recorded name is self-declared by someone with access to the private link. The flow does not verify identity with an account, certificate or graphical signature, and collects no additional IP address or user-agent evidence.

## Concurrency, retries and errors

First acceptances run under the same organization write lock as work order mutations and share revocation/replacement. After finding the organization from the token hash, the transaction locks the organization and reloads the share. Its tenant/work-order binding, expiry and revocation are checked inside the lock, including before returning an existing receipt. A unique database key prevents a second record for the same completion even through another share.

An exact replay compares the normalized name, original snapshot hash and consent version to the existing record. It returns the original receipt without writing, even if platform access has expired since acceptance. A different replay cannot overwrite the first record. Expired or revoked tokens are rejected for both new submissions and retries.

| Error code                                | HTTP | Meaning                                                                                                   |
| ----------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `INVALID_WORK_ORDER_ACCEPTANCE_INPUT`     | 400  | Invalid application input; malformed HTTP DTOs use the standard validation error.                         |
| `WORK_ORDER_SHARE_NOT_FOUND`              | 404  | Unknown, expired, revoked or mismatched share.                                                            |
| `WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE`     | 409  | Order is not completed, has no valid completion, or recorded evidence does not match the current version. |
| `WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT` | 409  | The service snapshot or consent version changed before a first acceptance.                                |
| `WORK_ORDER_ALREADY_ACCEPTED`             | 409  | A different acceptance attempt exists for this completion.                                                |
| `SUBSCRIPTION_REQUIRED`                   | 403  | Organization lacks platform access for a first acceptance.                                                |
| `BILLING_RECONCILIATION_REQUIRED`         | 503  | A first acceptance is blocked during billing reconciliation.                                              |
| `WORK_ORDERS_BUSY`                        | 503  | Existing transaction retry policy could not complete the operation.                                       |

After a conflict, refresh the portal before allowing a new decision. After a timeout or uncertain response, resolve the portal to establish whether acceptance succeeded; do not silently submit a new decision or invent a receipt.

## Verification

Run `pnpm exec vitest run`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build`. Acceptance tests cover immutable service snapshots, exclusion of private and dynamic fields, pending/accepted portal states, timestamp/version binding, stale terms/content, concurrent retries, divergent submissions, expired/revoked/mismatched shares, token revalidation after the organization lock, scoped repository operations, organization-member/platform policies and the NestJS HTTP contract with strict validation, privacy headers, rate limiting and error envelopes.
