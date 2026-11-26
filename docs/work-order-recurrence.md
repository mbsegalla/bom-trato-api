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

## Phase 3.3 — recurring service management

`GET /api/organizations/:organizationId/work-order-recurrences` lists completed source orders with a configured recurrence for the active organization. Verified members can read the list after platform access expires, but cannot write. It uses the existing standard data envelope with `{ items, page, hasMore, today, canConfigure }`.

- Optional filters: `status=ACTIVE|PAUSED|ARCHIVED`, `visit=OVERDUE|TODAY|NEXT_SEVEN_DAYS`, and `customerName` (case-insensitive substring of the current customer name, up to 100 characters). Omit a filter to include all values.
- Archived customers are grouped separately; their stored recurrence configuration is preserved. Active and paused filters include non-archived customers only. Date filters apply to the recorded date regardless of status.
- `NEXT_SEVEN_DAYS` includes the business day and the following seven calendar days. `OVERDUE` means a recorded date strictly before today. Results are ordered by next visit, then source work order ID, with the standard `page` and `limit` pagination.
- Each item includes the source work order ID, title, customer ID/name, archived flag and existing recurrence settings. The existing per-order GET/PUT endpoints handle all mutations and retain their optimistic concurrency and access rules.
- No new migration or environment variables are required beyond phase 3.2. There is no automated quote, scheduling, reminder or billing action.

## Phase 3.4 — automatic draft generation

Existing plans remain manual. Set `autoGenerateEnabled: true` in the per-order PUT to opt in; omission preserves the current value (false on creation). The response and list expose `autoGenerateEnabled`, `lastGeneratedQuoteId` and `lastGeneratedVisitOn` (null before the first generation). Pausing a recurrence suspends generation without removing its opt-in or history.

Every 15 minutes the worker scans due, active, opted-in plans. Each candidate is re-read under the organization write lock, rechecking the completed source order, approved source quote, current customer, owner membership/verification and current platform access. Drafts reuse the manual repeat-service domain logic, historical prices and original payment terms. The owner is the recorded actor. The worker does not approve or send the quote, create an order/booking, charge the customer or notify anyone. Review the price and availability before sending.

The generation ledger has a unique primary key per source order and visit date and tenant-scoped foreign keys. The draft, status history, ledger and advancement of the plan are one transaction. A previously generated date advances without a second draft, even after a manual date edit. Concurrent workers and edits reuse the organization lock and recurrence version. Missed dates produce at most one draft for the recorded due date and advance to the first strictly future date; no backlog is generated. Days/weeks use UTC calendar arithmetic; months clamp to the last valid day of the target month, and the stored next date becomes the anchor for later runs. Billing-ineligible, archived and paused plans are skipped. Errors leave the date unchanged for retry.

Apply migration `20261126130000_add_recurring_service_generation`, regenerate Prisma Client and deploy the API first. Optional `WORK_ORDER_RECURRENCE_WORKER_ENABLED=false` stops all worker runs (default true). This does not change existing per-plan opt-ins. Test two concurrent workers, stale writes, rollbacks, no-access/archived/paused plans and due dates crossing month/year boundaries before production deployment. Customer reminders are outside phase 3.4.

## Phase 3.5 — recurrence reminders

The existing in-app notification center is the only delivery channel. No emails, WhatsApp messages, external customer contacts, quotes sent to customers or bookings are created by reminders.

- The hourly reminder worker scans active plans with a recorded next visit from seven calendar days ago through three days ahead, using America/Sao_Paulo. One upcoming reminder is allowed within the three days before the visit, one due reminder for manual plans on the date, and one overdue reminder if the recorded date is one to seven days in the past.
- Automatic plans suppress the same-day reminder to avoid competing with draft creation. A still-pending automatic plan can receive an overdue reminder starting the following day. Older overdue dates remain visible in the recurring service management screen; the worker intentionally does not flood the inbox with historical reminders.
- The current verified organization owner receives the reminders only if the organization can operate. The worker re-reads the completed order, approved quote, non-archived customer, current recurrence and access under the organization write lock. The generation ledger suppresses reminders for an already-generated visit date. Paused/archived/ineligible plans do not receive new alerts.
- Keys include organization, source order, recipient, visit date and reminder stage. Existing unique keys and duplicate-safe inserts prevent repeat deliveries even across worker replicas; notifications are published through the existing transaction-aware PostgreSQL realtime channel.
- A newly generated automatic draft creates a separate in-app notification with a link to the quote, inside the same transaction as the quote, generation ledger and recurrence advancement. It does not backfill older generated drafts. Previously delivered notifications are historical records, not live booking status.

### Rollout

Apply migration `20261126140000_add_recurring_service_reminders` and regenerate Prisma Client. Deploy the API and the updated frontend notification schema before enabling `WORK_ORDER_RECURRENCE_REMINDER_WORKER_ENABLED=true` in the API environment. The flag defaults to false for a safe rolling deployment, controls both the hourly worker and new draft notifications, and does not disable automatic draft generation itself. No new Resend template or dependencies are needed. Validate the migration, authorization and tenant isolation, duplicate inserts with multiple worker instances, rollback and realtime notification behavior before enabling in production.

## Recurrence regression checks

The HTTP contract suite uses Nest's real recurrence controllers, global validation, error filter and response interceptor with mocked application use cases. Worker tests exercise the real worker and use case with mocked repositories: disabled feature flags, Sao Paulo date boundaries, batch traversal and failure isolation. These do not replace a real database or authentication-guard integration test.

After installing dependencies and generating Prisma Client, run:

```bash
pnpm exec vitest run test/workOrderRecurrence.http.spec.ts test/repeatWorkOrderQuote.spec.ts src/modules/workOrders/domain/policies/workOrderRecurrence.policy.spec.ts src/modules/workOrders/domain/policies/workOrderRecurrenceGeneration.policy.spec.ts src/modules/workOrders/domain/policies/workOrderRecurrenceReminder.policy.spec.ts src/modules/workOrders/domain/policies/workOrderRecurrenceVisit.policy.spec.ts src/modules/workOrders/infrastructure/workers/workOrderRecurrence.worker.spec.ts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

On a disposable PostgreSQL instance with all migrations applied, verify the following before production enablement:

- Cross-organization access cannot read, edit, generate or notify another organization's recurrence; unverified users and expired access cannot mutate it.
- Two worker instances processing the same due plan create exactly one draft and one generation row, increment the version once and advance the date once.
- A forced failure after draft creation rolls back the quote, its items/status history, generation row, notification and date advancement.
- A stale PUT after generation returns a version conflict; paused or archived plans and blocked billing create no new records.
- Re-running reminders creates no duplicate notification for the same owner/date/stage. Changing a planned date does not re-notify an already generated occurrence.
- Notifications reach the correct organization's owner and open the source recurrence or generated quote in the updated frontend; no external customer email, payment or booking is created.

Keep the reminder flag disabled until the full stack passes these checks. This checklist is a test plan, not a claim that a database run has already passed.
