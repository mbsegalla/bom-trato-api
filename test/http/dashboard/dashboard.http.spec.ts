import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetDashboardSummaryUseCase } from '../../../src/modules/dashboard/application/useCases/getDashboardSummary.useCase.js';
import { GetDashboardFinancialUseCase } from '../../../src/modules/dashboard/application/useCases/getDashboardFinancial.useCase.js';
import { GetDashboardFinancialTrendUseCase } from '../../../src/modules/dashboard/application/useCases/getDashboardFinancialTrend.useCase.js';
import { ListDashboardUpcomingWorkOrdersUseCase } from '../../../src/modules/dashboard/application/useCases/listDashboardUpcomingWorkOrders.useCase.js';
import { DashboardController } from '../../../src/modules/dashboard/presentation/http/controllers/dashboard.controller.js';

import { createHttpFixture, organizationId, itemId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/dashboard';
const actor = { organizationId, userId };
const period = { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' };
describe('dashboard HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const summary = vi.fn();
  const financial = vi.fn();
  const trend = vi.fn();
  const upcoming = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture([DashboardController], [
      { provide: GetDashboardSummaryUseCase, useValue: { execute: summary } },
      { provide: GetDashboardFinancialUseCase, useValue: { execute: financial } },
      { provide: GetDashboardFinancialTrendUseCase, useValue: { execute: trend } },
      { provide: ListDashboardUpcomingWorkOrdersUseCase, useValue: { execute: upcoming } },

    ]);
  });

  beforeEach(() => {
    summary.mockReset().mockResolvedValue({});
    financial.mockReset().mockResolvedValue({});
    trend.mockReset().mockResolvedValue({});
    upcoming.mockReset().mockResolvedValue({ items: [] });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication and explicit timezone-aware dates for financial and operational reports', async () => {
    const valid = new URLSearchParams(period).toString();
    await request(fixture.server).get(route + '/summary?' + valid).expect(401);

    for (const query of ['from=invalid&to=invalid', 'from=2026-01-01T00:00:00&to=2026-02-01T00:00:00', valid + '&userId=' + itemId]) {
      await request(fixture.server).get(route + '/financial?' + query).set('Authorization', 'Bearer fixture').expect(400);
    }

    expect(summary).not.toHaveBeenCalled();
    expect(financial).not.toHaveBeenCalled();
  });

  it('passes the authenticated scope and original period to all report use cases', async () => {
    for (const path of ['summary', 'financial', 'financial-trend']) {
      await request(fixture.server).get(route + '/' + path).query(period).set('Authorization', 'Bearer fixture').expect(200);
    }

    for (const execute of [summary, financial, trend]) {
      expect(execute).toHaveBeenCalledWith(actor, expect.objectContaining(period));
    }
  });

  it('rejects out-of-range upcoming limits and transforms valid query parameters to numbers', async () => {
    for (const limit of ['0', '51', '1.5']) {
      await request(fixture.server).get(route + '/upcoming-work-orders?limit=' + limit).set('Authorization', 'Bearer fixture').expect(400);
    }

    expect(upcoming).not.toHaveBeenCalled();

    await request(fixture.server).get(route + '/upcoming-work-orders?limit=7').set('Authorization', 'Bearer fixture').expect(200);

    expect(upcoming).toHaveBeenCalledWith(actor, 7);
  });
});
