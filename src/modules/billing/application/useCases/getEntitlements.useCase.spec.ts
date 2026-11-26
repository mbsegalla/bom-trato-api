import { describe, expect, it, vi } from 'vitest';

import type { OrganizationPlatformAccessReader } from '../../../organizations/application/ports/organizationPlatformAccessReader.port.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import { GetEntitlementsUseCase } from './getEntitlements.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const access: OrganizationAccessContext = { isMember: true, verified: true, hasPlatformAccess: true, source: 'SUBSCRIPTION', billingNeedsReconciliation: false };
function fixture() {
  const read = vi.fn<OrganizationPlatformAccessReader['read']>().mockResolvedValue(access);
  const entitlements = vi.fn<BillingRepository['entitlements']>().mockResolvedValue({ maxUsers: 5, memberCount: 2, teamManagementEnabled: true, isOwner: true });
  const active = vi.fn<PlanChangeRepository['active']>().mockResolvedValue(null);
  return { read, entitlements, active, useCase: new GetEntitlementsUseCase(
    { entitlements } as unknown as BillingRepository, { active } as unknown as PlanChangeRepository, { read },
  ) };
}
describe('GetEntitlementsUseCase', () => {
  it('does not read billing limits for nonmembers or conflicting subscriptions', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce({ ...access, isMember: false }).mockResolvedValueOnce({ ...access, billingNeedsReconciliation: true });
    await expect(f.useCase.execute(actor)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    await expect(f.useCase.execute(actor)).rejects.toThrow('MULTIPLE_SUBSCRIPTIONS');
    expect(f.entitlements).not.toHaveBeenCalled();
  });
  it('enforces the single-user trial limit independently of a paid plan', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce({ ...access, source: 'TRIAL' });
    expect(await f.useCase.execute(actor)).toEqual({ hasAccess: true, maxUsers: 1, memberCount: 2, teamManagementEnabled: false, canAddMember: false });
    expect(f.active).not.toHaveBeenCalled();
  });
  it('uses the pending downgrade limit and verifies ownership and entitlement', async () => {
    const f = fixture();
    expect(await f.useCase.execute(actor)).toMatchObject({ maxUsers: 5, canAddMember: true });
    f.active.mockResolvedValueOnce({ targetMaxUsers: 2 } as NonNullable<Awaited<ReturnType<PlanChangeRepository['active']>>>);
    expect(await f.useCase.execute(actor)).toMatchObject({ maxUsers: 5, canAddMember: false });
    f.entitlements.mockResolvedValueOnce({ maxUsers: 5, memberCount: 2, teamManagementEnabled: true, isOwner: false });
    expect(await f.useCase.execute(actor)).toMatchObject({ canAddMember: false });
    f.read.mockResolvedValueOnce({ ...access, verified: false });
    expect(await f.useCase.execute(actor)).toMatchObject({ hasAccess: false, canAddMember: false });
  });
});
