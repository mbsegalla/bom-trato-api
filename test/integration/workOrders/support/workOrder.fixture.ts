import { randomBytes, randomUUID } from 'node:crypto';

import type { WorkOrderPhotoStage } from '../../../../src/generated/prisma/enums.js';
import { NodeWorkOrderShareSecurity } from '../../../../src/modules/workOrders/infrastructure/security/nodeWorkOrderShareSecurity.js';
import type { createDisposableDatabaseFixture } from '../../support/disposableDatabase.fixture.js';

type DatabaseFixture = ReturnType<typeof createDisposableDatabaseFixture>;

export async function createWorkOrderFixture(db: DatabaseFixture) {
  const actor = await db.tenant();
  const now = new Date();
  const completedAt = new Date(now.getTime() - 60000);
  const customer = await db.prisma.customer.create({
    data: {
      organizationId: actor.organizationId,
      name: 'Fixture Customer Name',
      email: randomUUID() + '@example.invalid',
    },
  });
  db.cleanup(() => db.prisma.customer.deleteMany({ where: { id: customer.id } }));

  const snapshot = {
    organizationId: actor.organizationId,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    title: 'Fixture completed service',
    currency: 'brl',
    subtotalInCents: 10000,
    discountInCents: 1000,
    totalInCents: 9000,
    createdById: actor.userId,
    updatedById: actor.userId,
  };
  const quote = await db.prisma.quote.create({
    data: { ...snapshot, status: 'APPROVED', sentAt: completedAt, decidedAt: completedAt },
  });
  db.cleanup(() => db.prisma.quote.deleteMany({ where: { id: quote.id } }));

  const order = await db.prisma.workOrder.create({
    data: {
      ...snapshot,
      quoteId: quote.id,
      status: 'COMPLETED',
      startedAt: new Date(completedAt.getTime() - 3600000),
      completedAt,
      assignedToId: actor.userId,
      serviceAddress: 'Private fixture address',
    },
  });
  db.cleanup(() => db.prisma.workOrder.deleteMany({ where: { id: order.id } }));

  const security = new NodeWorkOrderShareSecurity();
  const issued = security.issue();
  const share = await db.prisma.workOrderShare.create({
    data: {
      organizationId: actor.organizationId,
      workOrderId: order.id,
      activeWorkOrderId: order.id,
      tokenHash: issued.hash,
      createdById: actor.userId,
      expiresAt: new Date(now.getTime() + 3600000),
    },
  });
  db.cleanup(() => db.prisma.workOrderShare.deleteMany({ where: { id: share.id } }));
  db.cleanup(() => db.prisma.workOrderAcceptance.deleteMany({ where: { workOrderId: order.id } }));
  db.cleanup(() => db.prisma.workOrderPhoto.deleteMany({ where: { workOrderId: order.id } }));

  await db.prisma.organization.update({
    where: { id: actor.organizationId },
    data: { city: 'Uberlândia', state: 'MG' },
  });
  const profile = await db.prisma.publicBusinessProfile.create({
    data: {
      organizationId: actor.organizationId,
      slug: 'fixture-' + randomUUID(),
      published: true,
      publishedAt: now,
      whatsappEnabled: true,
      whatsappEnabledAt: now,
      whatsappPhone: '34999991234',
    },
  });
  db.cleanup(() => db.prisma.publicBusinessProfile.deleteMany({ where: { id: profile.id } }));

  async function photo(stage: WorkOrderPhotoStage, visibleInPortal = true) {
    return db.prisma.workOrderPhoto.create({
      data: {
        organizationId: actor.organizationId,
        workOrderId: order.id,
        objectKey: 'fixture/' + randomUUID() + '.webp',
        stage,
        visibleInPortal,
        width: 800,
        height: 600,
        sizeInBytes: 1024,
        createdById: actor.userId,
      },
    });
  }

  async function reviewInvitation() {
    const tokenHash = randomBytes(32).toString('hex');

    return db.prisma.professionalReviewInvitation.create({
      data: {
        publicBusinessProfileId: profile.id,
        workOrderId: order.id,
        createdById: actor.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }

  return {
    actor,
    customer,
    order,
    profile,
    share,
    token: issued.token,
    tokenHash: issued.hash,
    security,
    photo,
    reviewInvitation,
  };
}
