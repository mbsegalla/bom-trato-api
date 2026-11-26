import { expect, it } from 'vitest';

import { OnboardingApplicationService } from '../../../src/modules/onboarding/application/services/onboardingApplicationService.service.js';
import { BootstrapOnboardingUseCase } from '../../../src/modules/onboarding/application/useCases/bootstrapOnboarding.useCase.js';
import { PrismaOnboardingRepository } from '../../../src/modules/onboarding/infrastructure/repositories/prismaOnboarding.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('onboarding provisioning and trial eligibility (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const user = await db.user();
    const repository = new PrismaOnboardingRepository(db.prisma);
    const application = new OnboardingApplicationService(repository);
    const bootstrap = new BootstrapOnboardingUseCase(repository, application);

    // Register cleanup before concurrent provisioning so failed tests also
    // remove partially created records, only for this unique fixture owner.
    db.cleanup(async () => {
      const organizations = await db.prisma.organization.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      });
      const ids = organizations.map((organization) => organization.id);

      await db.prisma.organizationTrial.deleteMany({ where: { ownerId: user.id } });
      await db.prisma.billingCustomer.deleteMany({ where: { organizationId: { in: ids } } });
      await db.prisma.organizationMember.deleteMany({ where: { organizationId: { in: ids } } });
      await db.prisma.organization.deleteMany({ where: { id: { in: ids } } });
    });

    const input = { userId: user.id, email: user.email, userName: '  Fixture owner  ' };

    return { user, repository, application, bootstrap, input };
  }

  it('returns a provisioning state before the user owns or joins an organization', async () => {
    const f = await fixture();

    expect(await f.application.state(f.user.id)).toEqual({
      step: 'PROVISIONING',
      organizationId: null,
      selectedPlanPriceId: null,
      accessSource: 'NONE',
      trialEligible: false,
      trial: null,
    });
  });

  it('creates exactly one provisional organization, owner membership and billing identity under concurrent bootstrap', async () => {
    const f = await fixture();

    const states = await Promise.all([f.bootstrap.execute(f.input), f.bootstrap.execute(f.input)]);

    expect(states[0]).toEqual(states[1]);
    expect(states[0]).toMatchObject({ step: 'CREATE_BUSINESS', trialEligible: true, accessSource: 'NONE' });

    const organizations = await db.prisma.organization.findMany({ where: { ownerId: f.user.id } });

    expect(organizations).toHaveLength(1);

    const organization = organizations[0]!;

    expect(organization).toMatchObject({
      id: states[0]!.organizationId,
      creationKey: f.user.id,
      setupCompletedAt: null,
    });
    expect(await db.prisma.organizationMember.findMany({ where: { organizationId: organization.id } })).toMatchObject([
      { userId: f.user.id, role: 'OWNER' },
    ]);
    expect(
      await db.prisma.billingCustomer.findUniqueOrThrow({ where: { organizationId: organization.id } }),
    ).toMatchObject({ billingEmail: f.user.email, billingName: 'Fixture owner', stripeCustomerId: null });
    expect(await db.prisma.organizationTrial.count({ where: { ownerId: f.user.id } })).toBe(0);
  }, 30000);

  it('requires membership for explicit organization state and owner identity for plan or business changes', async () => {
    const f = await fixture();
    const other = await db.user();
    const state = await f.bootstrap.execute(f.input);
    const organizationId = state.organizationId!;

    await expect(f.application.state(other.id, organizationId)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    await expect(f.repository.selectPlan(other.id, organizationId, organizationId)).rejects.toThrow(
      'ORGANIZATION_NOT_FOUND',
    );
    await expect(
      f.repository.completeBusinessSetup({ userId: other.id, organizationId, name: 'Foreign name' }),
    ).rejects.toThrow('ORGANIZATION_NOT_FOUND');

    await db.prisma.organizationMember.create({
      data: { organizationId, userId: other.id, role: 'MEMBER' },
    });
    db.cleanup(() => db.prisma.organizationMember.deleteMany({ where: { organizationId, userId: other.id } }));

    expect(await f.application.state(other.id, organizationId)).toMatchObject({
      step: 'CONTACT_OWNER',
      trialEligible: false,
    });
    expect(await f.application.state(f.user.id, organizationId)).toMatchObject({
      trialEligible: false,
      step: 'SELECT_PLAN',
    });
  });

  it('does not offer a trial after billing activity and rejects unpublished or missing plan prices', async () => {
    const f = await fixture();
    const state = await f.bootstrap.execute(f.input);
    const organizationId = state.organizationId!;

    await db.prisma.billingCustomer.update({
      where: { organizationId },
      data: { creationRequestedAt: new Date() },
    });
    expect(await f.application.state(f.user.id, organizationId)).toMatchObject({
      step: 'SELECT_PLAN',
      trialEligible: false,
    });

    await expect(f.repository.selectPlan(f.user.id, organizationId, organizationId)).rejects.toThrow(
      'PLAN_UNAVAILABLE',
    );
    await expect(
      f.repository.completeBusinessSetup({ userId: f.user.id, organizationId, name: 'Unpaid business' }),
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED');

    expect(await db.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).toMatchObject({
      setupCompletedAt: null,
    });
  });
});
