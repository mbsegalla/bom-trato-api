import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

import { PrismaOrganizationTrialActivation } from '../../../src/modules/organizations/infrastructure/transactions/prismaOrganizationTrialActivation.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('organization trial activation (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture(owner = undefined as Awaited<ReturnType<typeof db.user>> | undefined, initial = true) {
    const user = owner ?? await db.user();
    const organization = await db.prisma.organization.create({ data: {
      name: 'Initial company', ownerId: user.id, creationKey: initial ? user.id : randomUUID(),
    } });
    db.cleanup(() => db.prisma.organization.deleteMany({ where: { id: organization.id } }));
    await db.prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER' } });
    db.cleanup(() => db.prisma.organizationMember.deleteMany({ where: { organizationId: organization.id } }));
    const customer = await db.prisma.billingCustomer.create({ data: {
      organizationId: organization.id, billingName: organization.name, billingEmail: user.email,
    } });
    db.cleanup(() => db.prisma.billingCustomer.deleteMany({ where: { id: customer.id } }));
    db.cleanup(() => db.prisma.organizationTrial.deleteMany({ where: { organizationId: organization.id } }));
    const activation = new PrismaOrganizationTrialActivation(db.prisma);
    const params = { organizationId: organization.id, userId: user.id, name: 'Activated company' };
    const readOrganization = () => db.prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    const readCustomer = () => db.prisma.billingCustomer.findUniqueOrThrow({ where: { id: customer.id } });
    const readTrial = () => db.prisma.organizationTrial.findUnique({ where: { organizationId: organization.id } });
    return { user, organization, customer, activation, params, readOrganization, readCustomer, readTrial };
  }

  it('activates the trial, completes setup and updates the billing name atomically', async () => {
    const f = await fixture();
    const result = await f.activation.activate(f.params);

    expect(result).toMatchObject({ status: 'ACTIVATED', trial: { organizationId: f.organization.id, ownerId: f.user.id, convertedAt: null, revokedAt: null } });
    const trial = await f.readTrial();
    expect(trial).not.toBeNull();
    expect(trial!.expiresAt.getTime() - trial!.startsAt.getTime()).toBe(14 * 86400000);
    expect(await f.readOrganization()).toMatchObject({ name: f.params.name, setupCompletedAt: trial!.startsAt });
    expect(await f.readCustomer()).toMatchObject({ billingName: f.params.name, stripeCustomerId: null });
  });

  it('returns the original persisted trial for retries without renaming the organization', async () => {
    const f = await fixture();
    const first = await f.activation.activate(f.params);
    expect(await f.activation.activate({ ...f.params, name: 'Different name' })).toMatchObject({
      status: 'EXISTING', trial: first.status === 'ACTIVATED' ? first.trial : undefined,
    });
    expect(await f.readOrganization()).toMatchObject({ name: f.params.name });
    expect(await db.prisma.organizationTrial.count({ where: { ownerId: f.user.id } })).toBe(1);
  });

  it('serializes simultaneous activation attempts without granting a second trial', async () => {
    const f = await fixture();
    const results = await Promise.all([f.activation.activate(f.params), f.activation.activate(f.params)]);
    expect(results.map((result) => result.status).sort()).toEqual(['ACTIVATED', 'EXISTING']);
    expect(await db.prisma.organizationTrial.count({ where: { ownerId: f.user.id } })).toBe(1);
  });

  it('does not grant a second trial for another organization owned by the same user', async () => {
    const f = await fixture();
    const second = await fixture(f.user, false);
    await f.activation.activate(f.params);
    expect(await second.activation.activate(second.params)).toEqual({ status: 'TRIAL_ALREADY_USED' });
    expect(await second.readTrial()).toBeNull();
    expect(await second.readOrganization()).toMatchObject({ setupCompletedAt: null });
  });

  it('does not activate a non-initial organization even when the owner has not used a trial', async () => {
    const f = await fixture(undefined, false);
    expect(await f.activation.activate(f.params)).toEqual({ status: 'TRIAL_NOT_AVAILABLE' });
    expect(await f.readTrial()).toBeNull();
  });

  it.each(['remote-customer', 'creation-checkpoint', 'completed-setup'] as const)('does not activate a trial after incompatible %s activity', async (state) => {
    const f = await fixture();
    if (state === 'completed-setup') {
      await db.prisma.organization.update({ where: { id: f.organization.id }, data: { setupCompletedAt: new Date() } });
    } else {
      await db.prisma.billingCustomer.update({ where: { id: f.customer.id }, data: state === 'remote-customer'
        ? { stripeCustomerId: 'cus_' + randomUUID() } : { creationRequestedAt: new Date() } });
    }
    expect(await f.activation.activate(f.params)).toEqual({ status: 'TRIAL_NOT_AVAILABLE' });
    expect(await f.readTrial()).toBeNull();
  });

  it('rejects an unrelated actor without changing the organization', async () => {
    const f = await fixture();
    const other = await db.user();
    await expect(f.activation.activate({ ...f.params, userId: other.id })).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(await f.readTrial()).toBeNull();
  });

  it('rejects an unverified owner before activation', async () => {
    const f = await fixture();
    await db.prisma.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } });
    await expect(f.activation.activate(f.params)).rejects.toThrow('EMAIL_NOT_VERIFIED');
    expect(await f.readTrial()).toBeNull();
  });

  it('requires the initial billing customer checkpoint', async () => {
    const f = await fixture();
    await db.prisma.billingCustomer.delete({ where: { id: f.customer.id } });
    await expect(f.activation.activate(f.params)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await f.readTrial()).toBeNull();
  });
});
