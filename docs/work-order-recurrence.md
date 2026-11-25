# Recurring services — phase 3.2

A verified member of an organization can configure a recurrence for a **completed** work order. The plan is independent of the completed service and is not shown in the customer portal.

## Configuration

- One optional configuration per source work order. Existing work orders are unaffected; nothing is automatically created.
- Frequency: 1–365 days, 1–52 weeks or 1–12 months.
- Next visit: an explicitly selected calendar day, stored as PostgreSQL DATE and returned as YYYY-MM-DD. Business dates use America/Sao_Paulo.
- Active or paused state. The next visit may be today or later when enabling or updating an active plan. An overdue plan may be paused without changing its recorded date. Dates before completion are always rejected.
- New records start with version 1; every successful edit increments the recurrence version. A stale update is rejected with 409. This version is independent of the work-order version.
- Create and update require current platform access and verified membership. Existing data remains readable to verified members after billing access expires. An archived customer cannot start or activate a plan; an existing plan can be paused while the organization can operate.
- No new appointment, quote, charge, reminder or background worker is created. The next visit is a reference date, not a booking. Future automatic processes must revalidate work order, customer and organization eligibility.

## API

`GET /api/organizations/:organizationId/work-orders/:workOrderId/recurrence`

Returns the standard data envelope with `{ recurrence, canConfigure, customerArchived, today, completedOn }`. The recurrence is null if not configured; `today` and `completedOn` are calendar dates, with the latter nullable for incomplete orders.

`PUT /api/organizations/:organizationId/work-orders/:workOrderId/recurrence`

Example for creation:

```json
{
  "intervalUnit": "MONTH",
  "intervalCount": 3,
  "nextVisitOn": "2027-02-25",
  "enabled": true,
  "version": 0
}
```

Use the current version for subsequent edits. Read/update operations are scoped by both organization and work-order ID; writes reuse the organization transaction lock and optimistic version comparison. The new table has a tenant-aware foreign key and a composite unique constraint for the one-to-one relation, plus checks for interval limits, date range and positive versions.

## Deployment

Migration: `20261126120000_add_work_order_recurrence`. Deploy API first. Apply the new migration and regenerate the Prisma Client:

```bash
pnpm exec prisma validate
pnpm exec prisma migrate deploy
pnpm prisma:generate
pnpm typecheck
```

No new dependencies or environment variables. The recurrence policy and its error class were compiled with the available TypeScript 5.8.3 compiler from exact source blobs (hashes verified). All 32 isolated cases passed under UTC, America/Sao_Paulo and Pacific/Auckland. This is not a Prisma, NestJS, Vitest or production-build result. Before merge, also run lint, formatting, Vitest and production builds; validate migration on a disposable PostgreSQL database, and exercise the API and UI against it. Existing migrations are not changed.
