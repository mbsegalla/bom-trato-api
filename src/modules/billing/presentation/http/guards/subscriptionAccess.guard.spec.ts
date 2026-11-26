import { describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@nestjs/common';
import type { OrganizationPlatformAccessReader } from '../../../../organizations/application/ports/organizationPlatformAccessReader.port.js';
import type { OrganizationAccessContext } from '../../../../organizations/domain/policies/organizationAccess.policy.js';
import { SubscriptionAccessGuard } from './subscriptionAccess.guard.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const access: OrganizationAccessContext = { isMember: true, verified: true, hasPlatformAccess: true, source: 'TRIAL', billingNeedsReconciliation: false };
function context(id: unknown = organizationId, auth: unknown = { user: { id: 'user' } }) {
  return { switchToHttp: () => ({ getRequest: () => ({ params: { organizationId: id }, auth }) }) } as unknown as ExecutionContext;
}
describe('SubscriptionAccessGuard', () => {
  it('uses the authenticated principal and the exact organization UUID', async () => {
    const read = vi.fn<OrganizationPlatformAccessReader['read']>().mockResolvedValue(access);
    const guard = new SubscriptionAccessGuard({ read });
    expect(await guard.canActivate(context())).toBe(true);
    expect(read).toHaveBeenCalledWith({ organizationId, userId: 'user' });
    await expect(guard.canActivate(context('bad'))).rejects.toMatchObject({ status: 404 });
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ params: { organizationId } }) }) } as unknown as ExecutionContext)).rejects.toMatchObject({ status: 404 });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{ isMember: false }, 404], [{ verified: false }, 403], [{ hasPlatformAccess: false }, 403], [{ billingNeedsReconciliation: true }, 409],
  ] as const)('fails closed on access %j', async (patch, status) => {
    const read = vi.fn<OrganizationPlatformAccessReader['read']>().mockResolvedValue({ ...access, ...patch });
    await expect(new SubscriptionAccessGuard({ read }).canActivate(context())).rejects.toMatchObject({ status });
  });
});
