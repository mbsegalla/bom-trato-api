# Repeat a completed service — phase 3.1

The first recurrence increment lets a verified organization member with active platform access start a new service from a completed work order, without retyping its items.

## API

`POST /api/organizations/:organizationId/quotes/:quoteId/repeat-service` returns a new draft quote (201). The quote ID refers to the approved quote linked to a completed work order in the same organization. No request body is needed.

The operation reads the original quote, completed work order, and current non-archived customer inside the existing organization write transaction. It copies the work order title and item descriptions, units, exact quantities, historical unit prices, and discount. It retains the original payment condition. All items have new IDs and are independent of the service catalog; prices must be reviewed before sending. The original work order and quote are not changed.

The resulting quote has a new ID, DRAFT status, version 1, and no inherited validity date, notes, previous approval, payment, private photos, checklist, acceptance, warranty, or share token. It uses the current customer record rather than stale contact details. The transaction creates the draft, items and initial status history together, or nothing at all.

The API returns a conflict if the source quote does not have a completed work order or the customer is archived. Invalid amounts or empty source items are rejected through the existing quote domain rules.

## User experience

A completed order exposes a **Repetir serviço** action. The confirmation explains that historical prices and payment terms must be reviewed. After creating the draft, the frontend opens its detail page. An uncertain request result prompts the operator to check the quote list rather than immediately repeating the POST.

## Deployment and scope

No migration, Prisma model change, package, or environment variable is required. Deploy the API before the frontend. This increment does not yet create a recurrence schedule, send reminders, auto-approve quotes, book time slots, or charge a customer. Those are separate future increments.

The isolated verification executed 20 scenarios using the exact new use case and existing quote entities/application service/access policy (source blob hashes verified), with a simulated transaction and generated-enum stand-ins. All 20 passed. It did not exercise NestJS HTTP, Prisma or the real database. Before merging, run the repository typecheck, lint, formatting, tests and build. Confirm the happy path and authorization, archived-customer, incomplete-order, historical-price and uncertain-response scenarios in an integration environment.
