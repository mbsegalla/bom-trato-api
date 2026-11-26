import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { readOrganizationTrialEligibility } from './prismaOrganizationTrialEligibility.js';

const now = new Date('2026-01-01');
const customer = {
  id: 'billing',
  stripeCustomerId: null,
  creationRequestedAt: null,
  _count: { billingCustomerReferences: 0 },
};
const organization = {
  id: 'org',
  ownerId: 'user',
  creationKey: 'user',
  setupCompletedAt: null,
  trial: null,
  billingCustomer: customer,
  _count: { organizationMembers: 1, subscriptions: 0, checkoutAttempts: 0 },
};
const member = { role: 'OWNER', user: { disabledAt: null, emailVerifiedAt: now } };

function fixture() {
  const findOrganization = vi.fn().mockResolvedValue(organization);
  const findMember = vi.fn().mockResolvedValue(member);
  const findTrial = vi.fn().mockResolvedValue(null);
  const findPaid = vi.fn().mockResolvedValue(null);
  const db = {
    organization: { findUnique: findOrganization, findFirst: findPaid },
    organizationMember: { findUnique: findMember },
    organizationTrial: { findUnique: findTrial },
  } as unknown as Prisma.TransactionClient;

  return {
    read: () => readOrganizationTrialEligibility(db, 'org', 'user'),
    findOrganization,
    findMember,
    findTrial,
    findPaid,
  };
}

describe('readOrganizationTrialEligibility', () => {
  it('allows an initial verified owner with no billing activity', async () => {
    const f = fixture();
    expect(await f.read()).toEqual({ eligibility: 'AVAILABLE', existingTrial: null, billingCustomerId: 'billing' });
    expect(f.findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org', userId: 'user' } },
      }),
    );
  });

  it.each(['organization', 'member'])('rejects missing %s', async (missing) => {
    const f = fixture();
    (missing === 'organization' ? f.findOrganization : f.findMember).mockResolvedValue(null);
    await expect(f.read()).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(f.findTrial).not.toHaveBeenCalled();
  });

  it('rejects a mismatched owner or a nonowner membership', async () => {
    const f = fixture();
    f.findOrganization.mockResolvedValueOnce({ ...organization, ownerId: 'other' });
    await expect(f.read()).rejects.toThrow('OWNER_REQUIRED');
    f.findMember.mockResolvedValueOnce({ ...member, role: 'MEMBER' });
    await expect(f.read()).rejects.toThrow('OWNER_REQUIRED');
  });

  it.each([
    { disabledAt: now, emailVerifiedAt: now },
    { disabledAt: null, emailVerifiedAt: null },
  ])('rejects ineligible owner identity', async (user) => {
    const f = fixture();
    f.findMember.mockResolvedValue({ ...member, user });
    await expect(f.read()).rejects.toThrow('EMAIL_NOT_VERIFIED');
  });

  it('requires a billing customer checkpoint', async () => {
    const f = fixture();
    f.findOrganization.mockResolvedValue({ ...organization, billingCustomer: null });
    await expect(f.read()).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
  });

  it.each([
    { _count: { ...organization._count, subscriptions: 1 } },
    { _count: { ...organization._count, checkoutAttempts: 1 } },
    { billingCustomer: { ...customer, stripeCustomerId: 'cus_fixture' } },
    { billingCustomer: { ...customer, creationRequestedAt: now } },
    { billingCustomer: { ...customer, _count: { billingCustomerReferences: 1 } } },
    { _count: { ...organization._count, organizationMembers: 2 } },
    { creationKey: 'other' },
    { setupCompletedAt: now },
    { trial: { id: 'trial' } },
  ])('blocks trial activation for incompatible organization state %j', async (patch) => {
    const f = fixture();
    f.findOrganization.mockResolvedValue({ ...organization, ...patch });
    expect(await f.read()).toMatchObject({ eligibility: 'TRIAL_NOT_AVAILABLE' });
  });

  it('blocks trial activation for owners with paid history elsewhere', async () => {
    const f = fixture();
    f.findPaid.mockResolvedValue({ id: 'other-org' });
    expect(await f.read()).toMatchObject({ eligibility: 'TRIAL_NOT_AVAILABLE' });
  });

  it('returns existing trial only for the same completed organization', async () => {
    const f = fixture();
    const trial = { id: 'trial', organizationId: 'org' };
    f.findTrial.mockResolvedValue(trial);
    expect(await f.read()).toMatchObject({ eligibility: 'TRIAL_NOT_AVAILABLE' });
    f.findOrganization.mockResolvedValue({ ...organization, setupCompletedAt: now });
    expect(await f.read()).toMatchObject({ eligibility: 'EXISTING', existingTrial: trial });
    f.findTrial.mockResolvedValue({ ...trial, organizationId: 'other' });
    expect(await f.read()).toMatchObject({ eligibility: 'TRIAL_ALREADY_USED' });
  });
});
