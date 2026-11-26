import { describe, expect, it, vi } from 'vitest';

import { Lead } from '../../domain/entities/lead.entity.js';
import type { LeadRepository } from '../../domain/repositories/lead.repository.js';
import type { LeadReadContext, LeadTransaction, LeadUnitOfWork } from '../ports/leadUnitOfWork.port.js';
import { LeadApplicationService } from '../services/leadApplicationService.service.js';

import { ArchiveLeadUseCase } from './archiveLead.useCase.js';
import { GetLeadUseCase } from './getLead.useCase.js';
import { ListLeadsUseCase } from './listLeads.useCase.js';
import { MarkLeadContactedUseCase } from './markLeadContacted.useCase.js';

const actor = { organizationId: 'org', userId: 'owner', leadId: 'lead' };
const now = new Date('2026-01-01T00:00:00Z');
const state = Lead.create(
  {
    id: actor.leadId,
    organizationId: actor.organizationId,
    publicBusinessProfileId: 'profile',
    requestKey: 'request',
    catalogServiceId: null,
    requestedServiceName: null,
    name: 'Fixture customer',
    email: 'client@example.invalid',
    message: 'Fixture request for service',
  },
  now,
).snapshot();
const access: LeadReadContext['access'] = {
  isMember: true,
  verified: true,
  hasPlatformAccess: true,
  source: 'TRIAL',
  billingNeedsReconciliation: false,
};

function fixture(permissions = access) {
  const leads = {
    findById: vi.fn<LeadRepository['findById']>().mockResolvedValue(state),
    list: vi.fn<LeadRepository['list']>().mockResolvedValue({ items: [state], page: 1, hasMore: false }),
    save: vi.fn<LeadRepository['save']>().mockResolvedValue(undefined),
  };
  const context = { leads, access: permissions } as unknown as LeadTransaction;
  const run = vi.fn(async (_actor: typeof actor, operation: (tx: LeadTransaction) => Promise<unknown>) =>
    operation(context),
  );
  const read = vi.fn(async (_actor: typeof actor, operation: (tx: LeadReadContext) => Promise<unknown>) =>
    operation(context),
  );
  const service = new LeadApplicationService({ run, read } as unknown as LeadUnitOfWork);

  return { leads, service };
}

describe('lead management use cases', () => {
  it('returns the scoped lead and forwards search filters without changing pagination', async () => {
    const f = fixture();
    const filters = { page: 2, limit: 5, status: 'NEW' as const, search: 'Fixture' };
    f.leads.list.mockResolvedValueOnce({ items: [state], page: 2, hasMore: true });

    expect(await new GetLeadUseCase(f.service).execute(actor)).toEqual(state);
    expect(await new ListLeadsUseCase(f.service).execute(actor, filters)).toEqual({
      items: [state],
      page: 2,
      hasMore: true,
    });
    expect(f.leads.findById).toHaveBeenCalledWith(actor.leadId);
    expect(f.leads.list).toHaveBeenCalledWith(filters);
    expect(f.leads.save).not.toHaveBeenCalled();
  });

  it('records contact and archive timestamps without creating conversion references', async () => {
    const f = fixture();
    const contacted = await new MarkLeadContactedUseCase(f.service).execute(actor);

    expect(contacted).toMatchObject({ status: 'CONTACTED', contactedAt: expect.any(Date), convertedQuoteId: null });
    expect(f.leads.save.mock.calls[0][0].snapshot()).toEqual(contacted);

    f.leads.findById.mockResolvedValueOnce(contacted);

    const archived = await new ArchiveLeadUseCase(f.service).execute(actor);

    expect(archived).toMatchObject({
      status: 'ARCHIVED',
      archivedAt: expect.any(Date),
      contactedAt: contacted.contactedAt,
    });
    expect(f.leads.save.mock.calls[1][0].snapshot()).toEqual(archived);
  });

  it('preserves original contact and archive dates on repeated transitions', async () => {
    const f = fixture();
    f.leads.findById.mockResolvedValueOnce({ ...state, status: 'CONTACTED', contactedAt: now, updatedAt: now });
    expect(await new MarkLeadContactedUseCase(f.service).execute(actor)).toMatchObject({
      contactedAt: now,
      updatedAt: now,
    });

    f.leads.findById.mockResolvedValueOnce({ ...state, status: 'ARCHIVED', archivedAt: now, updatedAt: now });
    expect(await new ArchiveLeadUseCase(f.service).execute(actor)).toMatchObject({ archivedAt: now, updatedAt: now });
  });

  it('rejects missing leads and forbidden converted-lead transitions without saving', async () => {
    const f = fixture();
    f.leads.findById.mockResolvedValueOnce(null);

    await expect(new GetLeadUseCase(f.service).execute(actor)).rejects.toThrow('LEAD_NOT_FOUND');

    f.leads.findById.mockResolvedValue({ ...state, status: 'CONVERTED', convertedAt: now });
    await expect(new MarkLeadContactedUseCase(f.service).execute(actor)).rejects.toThrow('INVALID_LEAD_TRANSITION');
    await expect(new ArchiveLeadUseCase(f.service).execute(actor)).rejects.toThrow('INVALID_LEAD_TRANSITION');

    expect(f.leads.save).not.toHaveBeenCalled();
  });

  it.each([
    [{ isMember: false }, 'MEMBER_REQUIRED'],
    [{ verified: false }, 'VERIFIED_USER_REQUIRED'],
    [{ billingNeedsReconciliation: true }, 'BILLING_RECONCILIATION_REQUIRED'],
    [{ hasPlatformAccess: false }, 'SUBSCRIPTION_REQUIRED'],
  ] as const)('rejects restricted reads and writes before accessing lead data: %j', async (override, code) => {
    const f = fixture({ ...access, ...override });

    await expect(new GetLeadUseCase(f.service).execute(actor)).rejects.toThrow(code);
    await expect(new ArchiveLeadUseCase(f.service).execute(actor)).rejects.toThrow(code);
    expect(f.leads.findById).not.toHaveBeenCalled();
    expect(f.leads.save).not.toHaveBeenCalled();
  });
});
