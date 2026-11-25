# Work order photos

Photos document the service before, during and after execution. Uploads are private by default. A verified member can explicitly share individual photos in the customer portal. This does not authorize publication in a public portfolio.

## Storage and deployment

1. Create a private R2/S3 bucket with public access disabled, including R2.dev and custom public domains. Grant the existing storage credentials read, write and delete access to this bucket.
2. Set `STORAGE_PRIVATE_BUCKET` to its name. It must differ from `STORAGE_BUCKET`, which continues to hold public organization logos.
3. Run `pnpm exec prisma migrate deploy` and `pnpm prisma:generate` before deploying the API, then deploy the frontend.

`STORAGE_PRIVATE_BUCKET` is optional so existing installations can start without enabling uploads. Uploads and image reads return `503` when private storage is unavailable. Listing metadata, opening portals without photos and revoking photo access remain available. No storage key or direct bucket URL is returned to a browser.

## Limits and privacy

- Up to 20 photos per work order, enforced under the organization write lock.
- JPEG, PNG and WebP uploads up to 10 MiB and 40 million pixels. Images are decoded and converted to WebP, resized to at most 2048 pixels per side and stripped of EXIF/XMP metadata. Animated images are rejected.
- Stages: `BEFORE`, `DURING` and `AFTER`. Captions contain at most 240 characters.
- Every upload starts with `visibleInPortal: false`. Photo versions are independent of the work order version.
- Authenticated image requests verify membership and the organization/work order scope. Public image requests accept the share token only in the POST body and verify expiry, revocation and photo visibility before and after storage I/O.
- Image responses are `image/webp`, `private, no-store` and `nosniff`. Clients retain image blobs only in memory and revoke object URLs when they are no longer needed. Previously downloaded images cannot be recalled.
- Uploading, editing and publishing require platform access. Verified members can still hide or delete photos after platform access expires.

## API

Authenticated routes are relative to `/api/organizations/:organizationId/work-orders/:workOrderId/photos`.

| Method | Route               | Input                                                          | Result                                                 |
| ------ | ------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/`                 | None                                                           | Photo metadata array in the standard response envelope |
| POST   | `/`                 | Multipart `file`, `stage`, optional `caption`                  | Private photo metadata, status 201                     |
| PATCH  | `/:photoId`         | JSON `version`, optional `stage`, `caption`, `visibleInPortal` | Updated photo metadata                                 |
| DELETE | `/:photoId`         | JSON `version`                                                 | Status 204                                             |
| GET    | `/:photoId/content` | Authenticated session                                          | WebP bytes                                             |

`POST /api/public/work-orders/resolve` includes only photos selected for the portal. `POST /api/public/work-orders/photos/:photoId/content` accepts `{ "token": "..." }` and returns WebP bytes. It uses the existing public share rate limit.

## Cleanup and verification

Failed uploads attempt to remove uncommitted objects. Deletion removes database metadata before attempting storage cleanup, so a storage outage cannot restore access. Cleanup is best effort: periodically reconcile private objects against `WorkOrderPhoto.objectKey` and remove only unreferenced objects older than 24 hours, outside active uploads. Never apply an unconditional bucket age rule to referenced photos.

Run `pnpm exec vitest run`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check`. The photo tests exercise real image conversion and metadata removal, access denial, optimistic versions, concurrent capacity changes, failed storage cleanup and revocation during image reads. HTTP tests cover multipart uploads with captions, the 10 MiB boundary, DTO validation and private binary responses through the real NestJS controllers and response interceptor.
