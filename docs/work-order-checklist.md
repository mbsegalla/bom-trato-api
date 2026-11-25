# Work order execution checklist

Each work order can have up to 50 custom checklist items. Titles are trimmed and contain 1–200 characters. Items start incomplete and private; a verified organization member can explicitly share individual items in the customer portal. Checklist completion does not change or block the work order status.

## Deployment

Run `pnpm exec prisma migrate deploy` and `pnpm prisma:generate` before deploying the API, then deploy the frontend. This feature needs no new environment variables, storage or dependencies.

## API

Authenticated routes are relative to `/api/organizations/:organizationId/work-orders/:workOrderId/checklist` and use the standard response envelope.

| Method | Route      | Input                                                      | Result                                      |
| ------ | ---------- | ---------------------------------------------------------- | ------------------------------------------- |
| GET    | `/`        | None                                                       | `{ items, progress: { total, completed } }` |
| POST   | `/`        | `{ title }`                                                | Private, incomplete item; status 201        |
| PATCH  | `/:itemId` | `{ version, title?, completed?, visibleInPortal? }`        | Updated item                                |
| DELETE | `/:itemId` | `{ version }`                                              | Status 204                                  |
| PATCH  | `/reorder` | `{ items: [{ id, version }, ...] }` in the requested order | Updated collection and progress             |

Every item has its own `version`, independent of `WorkOrder.version`. Item responses contain `id`, `title`, `position`, `completed`, `completedAt`, `completedById`, `visibleInPortal`, `version`, `createdAt` and `updatedAt`.

## Completion and concurrency

- Completing an incomplete item records the authenticated member and server time. Repeating completion, changing visibility or submitting the same normalized title preserves the original completion attribution.
- Reopening an item clears its completion time and author. Changing its normalized title also reopens it. Changing a title and setting `completed: true` in the same request is rejected; complete the revised task in a separate action.
- Every write runs under the existing organization transaction lock. Capacity is checked inside that transaction. Item updates and deletes require the current item version.
- Reordering requires the exact current set of IDs, without duplicates, and the current version of every item. It validates the complete snapshot before saving any positions. Missing, additional, deleted or stale items produce `409 WORK_ORDER_CHECKLIST_VERSION_CONFLICT`; reload the collection before retrying.
- Reordering increments only the versions of items whose positions change. Deletion preserves survivor positions and versions; later creates append after the largest position. Returned array order is authoritative even when internal positions have gaps.

## Access and privacy

Verified members can read, hide and delete checklist items after platform access expires, including while billing reconciliation is required. Creating, editing, completing, reopening, reordering and publishing require platform access. A hide request combined with another actual change still requires platform access.

`POST /api/public/work-orders/resolve` includes `checklist: { items, progress }` through the existing token, expiry, revocation and rate limit checks. The database query selects only visible items in checklist order. Public items contain exactly `id`, `title`, `completed` and `completedAt`. Public progress counts only those visible items. No internal positions, author IDs, private totals or item versions are exposed.

## Verification

Run `pnpm exec vitest run`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build`. Checklist tests cover capacity, completion attribution, automatic reopening, tenant/member/platform policies, stale versions, complete reorder snapshots, public projection and the NestJS HTTP contract, including nested DTO validation and the standard response/error envelopes.
