import { describe, expect, it, vi } from 'vitest';

import type { DashboardRepository } from '../ports/dashboardRepository.port.js';
import type { DashboardReadContext, DashboardUnitOfWork } from '../ports/dashboardUnitOfWork.port.js';
import { DashboardApplicationService } from '../services/dashboardApplicationService.service.js';

import { GetDashboardFinancialUseCase } from './getDashboardFinancial.useCase.js';
import { GetDashboardFinancialTrendUseCase } from './getDashboardFinancialTrend.useCase.js';
import { GetDashboardSummaryUseCase } from './getDashboardSummary.useCase.js';
import { ListDashboardUpcomingWorkOrdersUseCase } from './listDashboardUpcomingWorkOrders.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const from = '2026-01-01T00:00:00Z',
  to = '2026-02-01T00:00:00Z';
const period = { from: new Date(from), to: new Date(to) };
const now = new Date('2026-01-15T00:00:00Z');
function fixture() {
  const dashboard = {
    summary: vi.fn<DashboardRepository['summary']>().mockResolvedValue({
      quotes: {
        draft: 1,
        awaitingApproval: 2,
        expiredSent: 0,
      },
      workOrders: {
        open: 1,
        scheduled: 2,
        inProgress: 0,
        completedInPeriod: 3,
      },
    }),
    financial: vi.fn<DashboardRepository['financial']>().mockResolvedValue({
      currentReceivables: {
        pendingCount: 1,
        pendingAmountInCents: 999,
        overdueCount: 0,
        overdueAmountInCents: 0,
      },
      periodReceipts: { count: 1, amountInCents: 1001 },
    }),
    financialTrend: vi.fn<DashboardRepository['financialTrend']>().mockResolvedValue({
      items: [
        {
          periodStart: period.from,
          count: 1,
          amountInCents: 1001,
        },
      ],
    }),
    upcomingWorkOrders: vi
      .fn<DashboardRepository['upcomingWorkOrders']>()
      .mockResolvedValue({ items: [], hasMore: false }),
  };
  const context: DashboardReadContext = {
    dashboard,
    access: {
      isMember: true,
      verified: true,
      hasPlatformAccess: true,
      source: 'TRIAL',
      billingNeedsReconciliation: false,
    },
    now,
  };
  const read = vi.fn(async (_actor: typeof actor, operation: (context: DashboardReadContext) => Promise<unknown>) =>
    operation(context),
  );
  const service = new DashboardApplicationService({ read } as unknown as DashboardUnitOfWork);

  return { dashboard, context, service, read };
}

describe('dashboard scoped queries', () => {
  it('uses one scoped read and exact period, timestamp and integer currency aggregates', async () => {
    const f = fixture();

    expect(await new GetDashboardSummaryUseCase(f.service).execute(actor, { from, to })).toMatchObject({
      period,
      generatedAt: now,
      quotes: { draft: 1 },
    });
    expect(await new GetDashboardFinancialUseCase(f.service).execute(actor, { from, to })).toMatchObject({
      period,
      currency: 'brl',
      periodReceipts: { amountInCents: 1001 },
    });
    expect(await new GetDashboardFinancialTrendUseCase(f.service).execute(actor, { from, to })).toMatchObject({
      period,
      currency: 'brl',
      items: [
        {
          periodStart: period.from,
          amountInCents: 1001,
        },
      ],
    });
    expect(f.dashboard.summary).toHaveBeenCalledWith(period, now);
    expect(f.dashboard.financial).toHaveBeenCalledWith(period, now);
    expect(f.dashboard.financialTrend).toHaveBeenCalledWith(period);
    expect(f.read).toHaveBeenCalledWith(actor, expect.any(Function));
  });

  it('denies unverified actors and invalid periods or limits before querying the repository', async () => {
    const f = fixture();

    await expect(new GetDashboardSummaryUseCase(f.service).execute(actor, { from: to, to: from })).rejects.toThrow(
      'INVALID_DASHBOARD_PERIOD',
    );

    for (const limit of [0, 51, 1.5]) {
      await expect(new ListDashboardUpcomingWorkOrdersUseCase(f.service).execute(actor, limit)).rejects.toThrow(
        'INVALID_DASHBOARD_LIMIT',
      );
    }

    expect(f.dashboard.summary).not.toHaveBeenCalled();
    expect(f.dashboard.upcomingWorkOrders).not.toHaveBeenCalled();
    expect(await new ListDashboardUpcomingWorkOrdersUseCase(f.service).execute(actor, 50)).toEqual({
      generatedAt: now,
      items: [],
      hasMore: false,
    });

    f.context.access.verified = false;

    await expect(new GetDashboardFinancialUseCase(f.service).execute(actor, { from, to })).rejects.toThrow(
      'VERIFIED_USER_REQUIRED',
    );
    expect(f.dashboard.financial).not.toHaveBeenCalled();
  });
});
