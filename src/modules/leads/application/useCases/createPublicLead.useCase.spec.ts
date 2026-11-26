import { describe, expect, it, vi } from 'vitest';

import type { LeadRepository } from '../../domain/repositories/lead.repository.js';
import type { LeadUnitOfWork, PublicLeadContext } from '../ports/leadUnitOfWork.port.js';

import { CreatePublicLeadUseCase } from './createPublicLead.useCase.js';

const input = {
  requestKey: 'request',
  name: 'Fixture customer',
  email: 'client@example.invalid',
  message: 'Preciso de uma revisao',
};
function fixture() {
  const create = vi.fn<LeadRepository['create']>().mockImplementation(async (lead) => ({
    lead: lead.snapshot(),
    created: true,
  }));
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const findPublicCatalogService = vi.fn<PublicLeadContext['findPublicCatalogService']>().mockResolvedValue(null);
  const tx: PublicLeadContext = {
    organizationId: 'org',
    publicBusinessProfileId: 'profile',
    organizationName: 'Fixture',
    recipientUserIds: ['first', 'second'],
    leads: { create },
    notifications: { enqueue },
    findPublicCatalogService,
  };
  const publicRun = vi.fn(async (_slug: string, operation: (context: PublicLeadContext) => Promise<unknown>) =>
    operation(tx),
  );
  const useCase = new CreatePublicLeadUseCase({ publicRun } as unknown as LeadUnitOfWork);

  return {
    create,
    enqueue,
    findPublicCatalogService,
    publicRun,
    useCase,
  };
}

describe('CreatePublicLeadUseCase', () => {
  it('derives organization from the published profile and notifies each scoped recipient only for new leads', async () => {
    const f = fixture();

    const result = await f.useCase.execute('published-slug', input);
    const state = f.create.mock.calls[0]?.[0].snapshot();

    expect(state).toMatchObject({
      organizationId: 'org',
      publicBusinessProfileId: 'profile',
      requestKey: 'request',
    });
    expect(f.publicRun).toHaveBeenCalledWith('published-slug', expect.any(Function));
    expect(f.enqueue).toHaveBeenCalledTimes(2);
    expect(f.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org',
        userId: 'first',
        key: 'lead-received/' + result.id + '/first',
      }),
    );

    f.create.mockResolvedValueOnce({ lead: state!, created: false });

    expect(await f.useCase.execute('published-slug', input)).toEqual(result);
    expect(f.enqueue).toHaveBeenCalledTimes(2);
  });

  it('does not accept an unavailable service from another profile', async () => {
    const f = fixture();

    await expect(
      f.useCase.execute('published-slug', {
        ...input,
        catalogServiceId: 'other-service',
      }),
    ).rejects.toThrow('PUBLIC_SERVICE_NOT_FOUND');
    expect(f.findPublicCatalogService).toHaveBeenCalledWith('other-service');
    expect(f.create).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});
