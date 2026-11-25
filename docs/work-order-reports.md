# Work order reports and commercial warranty

Phase 2.9 adds a PDF report and an optional, explicitly declared commercial warranty.

## Deployment

The migration `20261125230000_add_work_order_warranty` creates the new warranty table. Apply it after the previous migrations, regenerate Prisma Client and deploy the API before the frontend:

```bash
pnpm exec prisma migrate deploy
pnpm prisma:generate
pnpm typecheck
```

No new packages, credentials or environment variables are required. PDFKit is already part of the API.

## Internal API

For verified organization members:

- `GET /api/organizations/:organizationId/work-orders/:workOrderId/warranty` returns `{ warranty, locked }`.
- `PUT /api/organizations/:organizationId/work-orders/:workOrderId/warranty` accepts `{ durationDays, terms, version }`; the version must be `0` on first creation and increment thereafter.
- `GET /api/organizations/:organizationId/work-orders/:workOrderId/report.pdf` downloads a private report with current service details and the date of any recorded completion acceptance.

New warranty declarations require active platform access and verified membership. They are blocked for canceled orders and after the customer accepts a completed service. Existing warranty details and private reports remain readable to verified members even if billing access has expired.

The number of days is limited to 1–3650; the company must explicitly provide the conditions (1–2000 characters). There is no automatic default warranty. When the work order is completed, the reference end date is calculated by adding the declared number of 24-hour days to the completion timestamp.

## Public customer portal

The public `POST /api/public/work-orders/resolve` response gains `warranty: { durationDays, terms, expiresAt } | null` for completed orders. Older frontend clients can omit the field. No warranty is shown before completion.

`POST /api/public/work-orders/report.pdf` accepts `{ token }` in the JSON body. It uses the same private-token access checks, expiry and revocation rules, rate limits, and privacy headers as the existing customer portal. It returns a PDF built from the public projection, **not** the internal one, and intentionally omits customer contact/name, source share, internal notes, private photographs and user details. It is not a fiscal document or a certified digital signature.

Warranty terms are a separate company declaration; the earlier digital acceptance records the originally accepted service scope. The report identifies this distinction. Report access does not extend the lifetime of a share link.

## Important

This implementation is a commercial-warranty management feature, not a legal interpretation of warranty obligations. It never invents coverage or silently creates a warranty. Statutory consumer rights may apply independently of any optional commercial terms.

Validate the PDF visually for multiple pages and unusual customer input before production rollout. Unit tests cover internal access, private/public projections and input constraints; a real browser and database migration dry run remain important checks.
