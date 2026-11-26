import { expect, it } from 'vitest';

import {
  createWorkOrderAcceptanceSnapshot,
  hashWorkOrderAcceptanceSnapshot,
} from '../../../src/modules/workOrders/application/mappers/workOrderAcceptance.mapper.js';
import { resolvePublicWorkOrderAcceptance } from '../../../src/modules/workOrders/application/services/publicWorkOrderAcceptance.service.js';
import { AcceptPublicWorkOrderUseCase } from '../../../src/modules/workOrders/application/useCases/acceptPublicWorkOrder.useCase.js';
import { WORK_ORDER_ACCEPTANCE_CONSENT_VERSION } from '../../../src/modules/workOrders/domain/entities/workOrderAcceptance.entity.js';
import { PrismaPublicWorkOrderUnitOfWork } from '../../../src/modules/workOrders/infrastructure/transactions/prismaPublicWorkOrderUnitOfWork.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

import { createWorkOrderFixture } from './support/workOrder.fixture.js';

databaseSuite('work order acceptance (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const f = await createWorkOrderFixture(db);
    const unit = new PrismaPublicWorkOrderUnitOfWork(db.prisma);
    const accept = new AcceptPublicWorkOrderUseCase(unit, f.security);
    const snapshot = await unit.read(f.tokenHash, async (tx) => {
      const order = await tx.findWorkOrder();

      if (!order) {
        throw new Error('Missing work order fixture');
      }

      return createWorkOrderAcceptanceSnapshot(order);
    });
    const input = {
      signerName: '  Fixture   signer  ',
      consent: true as const,
      consentVersion: WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
      snapshotHash: hashWorkOrderAcceptanceSnapshot(snapshot),
    };
    const count = () => db.prisma.workOrderAcceptance.count({ where: { workOrderId: f.order.id } });

    return { ...f, unit, accept, input, snapshot, count };
  }

  it('persists the exact financial snapshot and exposes only receipt dates to the public', async () => {
    const f = await fixture();
    const receipt = await f.accept.execute(f.token, f.input);

    const stored = await db.prisma.workOrderAcceptance.findFirstOrThrow({
      where: { workOrderId: f.order.id },
    });

    expect(stored).toMatchObject({
      organizationId: f.actor.organizationId,
      shareId: f.share.id,
      signerName: 'Fixture signer',
      consent: true,
      snapshotHash: f.input.snapshotHash,
      snapshot: f.snapshot,
      workOrderVersion: f.order.version,
    });
    expect(stored.snapshot).not.toHaveProperty('customerEmail');
    expect(JSON.stringify(stored.snapshot)).not.toContain('Private fixture address');
    expect(receipt).toEqual({ acceptedAt: stored.acceptedAt, completedAt: stored.completedAt });
    expect(await f.count()).toBe(1);
  });

  it('serializes simultaneous identical acceptances and rejects conflicting replays', async () => {
    const f = await fixture();

    const receipts = await Promise.all([f.accept.execute(f.token, f.input), f.accept.execute(f.token, f.input)]);

    expect(receipts[0]).toEqual(receipts[1]);
    expect(await f.count()).toBe(1);

    await expect(f.accept.execute(f.token, { ...f.input, signerName: 'Different signer' })).rejects.toThrow(
      'WORK_ORDER_ALREADY_ACCEPTED',
    );
    expect(await f.count()).toBe(1);
  }, 30000);

  it('rejects a stale financial snapshot before writing acceptance evidence', async () => {
    const f = await fixture();

    await db.prisma.workOrder.update({
      where: { id: f.order.id },
      data: { version: { increment: 1 }, title: 'Changed service' },
    });

    await expect(f.accept.execute(f.token, f.input)).rejects.toThrow('WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT');
    expect(await f.count()).toBe(0);
  });

  it('denies expired or revoked links and uncompleted orders', async () => {
    const f = await fixture();

    await db.prisma.workOrder.update({
      where: { id: f.order.id },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });
    await expect(f.accept.execute(f.token, f.input)).rejects.toThrow('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');

    await db.prisma.workOrderShare.update({
      where: { id: f.share.id },
      data: { revokedAt: new Date(), activeWorkOrderId: null },
    });
    await expect(f.accept.execute(f.token, f.input)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(await f.count()).toBe(0);
  });

  it('retains an already recorded receipt when the organization loses platform access', async () => {
    const f = await fixture();
    const receipt = await f.accept.execute(f.token, f.input);

    await db.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId },
      data: { revokedAt: new Date() },
    });

    expect(await f.accept.execute(f.token, f.input)).toEqual(receipt);
    const status = await f.unit.read(f.tokenHash, async (tx) => {
      const order = await tx.findWorkOrder();

      if (!order) {
        throw new Error('Missing work order fixture');
      }

      return resolvePublicWorkOrderAcceptance(tx, order);
    });

    expect(status).toMatchObject({ canAccept: false, snapshotHash: null, receipt });
    expect(await f.count()).toBe(1);
  });
});
