# Verified reviews and professional portfolio — phase 2.10

The existing professional profile already supports verified reviews, ratings and service listings. Phase 2.10 adds a curated, consent-driven gallery of real work order photos without changing the review system.

## Safe publication flow

1. An operational user uploads a before/after photo to the private bucket (the existing flow), then makes it visible in the customer portal.
2. After the work order is **COMPLETED**, the holder of a valid private share token can explicitly authorize each selected photo for public publication, recording a name and consent version 1.
3. The organization must separately choose **Publish** for that photo. Neither uploading nor granting customer-portal visibility auto-publishes it.
4. The gallery appears only while the public business profile is published. The API selects at most 12 most recently published photos for the profile page.
5. The public image endpoint reads bytes from **private** storage and verifies the photo is still published, authorized, visible in the portal, part of a completed work order, and belongs to the published profile before **and after** the storage read.
6. Withdrawing consent removes publication in the same database transaction. A customer can withdraw using a still-active share token; after token expiration, the organization can withdraw consent on request through the authenticated endpoint.

No customer name, address, review identity, original photograph caption, storage key, or work order identifier is exposed in the public gallery. The recorded consent name and share ID remain private.

**Important limitation:** like the existing service acceptance, authorization is recorded from a bearer share token and an explicitly provided name, without independent identity verification. The organization remains responsible for confirming it has the necessary image rights and for promptly handling any withdrawal requests. Previously loaded copies outside the API cannot be recalled.

## API

Public share (POST, rate-limited):
- `/api/public/work-orders/portfolio/status`: `{ token }`
- `/api/public/work-orders/portfolio/consent`: `{ token, photoIds, signerName, consent: true, consentVersion: '1' }`
- `/api/public/work-orders/portfolio/revoke`: `{ token, photoId }`

Authenticated operations:
- `GET /api/organizations/:organizationId/work-orders/:workOrderId/portfolio`
- `POST /api/organizations/:organizationId/work-orders/:workOrderId/portfolio/:photoId/publish` with `{ publish: boolean }`
- `POST /api/organizations/:organizationId/work-orders/:workOrderId/portfolio/:photoId/revoke-consent`

Public professional:
- `GET /api/public/professionals/:slug` now includes a `portfolio` array with public photo IDs, stages and dimensions.
- `GET /api/public/professionals/:slug/portfolio/:photoId/content` returns `image/webp` with no-store headers if permission is still valid.

## Deployment

Apply migration `20261126100000_add_work_order_portfolio_consent`, regenerate Prisma Client and deploy API first:

```bash
pnpm exec prisma migrate deploy
pnpm prisma:generate
pnpm typecheck
```

The migration adds nullable consent/publication metadata to the existing WorkOrderPhoto model; it does **not** publish or backfill existing photos. No new dependencies or environment variables are needed beyond the private bucket already used by work-order photos.

After deploying the frontend, test: explicit consent, publication, profile unpublication, stage changes, portal visibility changes, revocation (both flows), multi-tenant isolation, expired shares, billing lapse and private bucket failures. Also run lint, formatting, backend integration tests and a production frontend build before merging.
