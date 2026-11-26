import { expect, it } from 'vitest';

import { createWorkOrderAcceptanceSnapshot, hashWorkOrderAcceptanceSnapshot } from '../../../src/modules/workOrders/application/mappers/workOrderAcceptance.mapper.js';
import { AcceptPublicWorkOrderUseCase } from '../../../src/modules/workOrders/application/useCases/acceptPublicWorkOrder.useCase.js';
import { GetWorkOrderWarrantyUseCase } from '../../../src/modules/workOrders/application/useCases/getWorkOrderWarranty.useCase.js';
import { UpdateWorkOrderWarrantyUseCase } from '../../../src/modules/workOrders/application/useCases/updateWorkOrderWarranty.useCase.js';
import { WORK_ORDER_ACCEPTANCE_CONSENT_VERSION } from '../../../src/modules/workOrders/domain/entities/workOrderAcceptance.entity.js';
import { PrismaPublicWorkOrderUnitOfWork } from '../../../src/modules/workOrders/infrastructure/transactions/prismaPublicWorkOrderUnitOfWork.js';
import { PrismaWorkOrderDocumentRepository } from '../../../src/modules/workOrders/infrastructure/transactions/prismaWorkOrderDocumentRepository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';
import { createWorkOrderFixture } from './support/workOrder.fixture.js';

databaseSuite('work order warranty persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const f = await createWorkOrderFixture(db);
    const repository = new PrismaWorkOrderDocumentRepository(db.prisma);
    const get = new GetWorkOrderWarrantyUseCase(repository);
    const update = new UpdateWorkOrderWarrantyUseCase(repository);
    const params = { ...f.actor, workOrderId: f.order.id };
    const input = { durationDays: 90, terms: '  Fixture declared warranty  ', version: 0 };

    db.cleanup(() => db.prisma.workOrderWarranty.deleteMany({ where: { workOrderId: f.order.id } }));

    return { ...f, repository, get, update, params, input };
  }

  it('normalizes terms and derives expiry from actual completion, with independent warranty versions', async () => {
    const f = await fixture();

    expect(await f.get.execute(f.params)).toEqual({ warranty: null, locked: false });
    const result = await f.update.execute(f.params, f.input);

    expect(result).toEqual({
      locked: false,
      warranty: {
        durationDays: 90,
        terms: 'Fixture declared warranty',
        version: 1,
        expiresAt: new Date(f.order.completedAt!.getTime() + 90 * 86400000),
      },
    });
    expect(await f.get.execute(f.params)).toEqual(result);

    await expect(f.update.execute(f.params, f.input)).rejects.toThrow('WORK_ORDER_WARRANTY_VERSION_CONFLICT');
    expect(await f.update.execute(f.params, { ...f.input, durationDays: 30, version: 1 }))
      .toMatchObject({ warranty: { durationDays: 30, version: 2 } });
    expect(await db.prisma.workOrder.findUniqueOrThrow({ where: { id: f.order.id } }))
      .toMatchObject({ version: f.order.version });
  });

  it('keeps expiry null until service completion', async () => {
    const f = await fixture();
    await db.prisma.workOrder.update({
      where: { id: f.order.id },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });

    expect(await f.update.execute(f.params, f.input)).toMatchObject({ warranty: { expiresAt: null }, locked: false });
    expect(await f.get.execute(f.params)).toMatchObject({ warranty: { expiresAt: null } });
  });

  it('locks warranty changes after actual public acceptance and preserves the original record', async () => {
    const f = await fixture();
    const original = await f.update.execute(f.params, f.input);
    const unit = new PrismaPublicWorkOrderUnitOfWork(db.prisma);
    const snapshotHash = await unit.read(f.tokenHash, async (tx) => {
      const order = await tx.findWorkOrder();

      if (!order) throw new Error('Missing fixture order');

      return hashWorkOrderAcceptanceSnapshot(createWorkOrderAcceptanceSnapshot(order));
    });

    await new AcceptPublicWorkOrderUseCase(unit, f.security).execute(f.token, {
      signerName: 'Fixture signer',
      consent: true,
      consentVersion: WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
      snapshotHash,
    });

    expect(await f.get.execute(f.params)).toEqual({ ...original, locked: true });
    await expect(f.update.execute(f.params, { ...f.input, version: 1, durationDays: 1 }))
      .rejects.toThrow('WORK_ORDER_WARRANTY_LOCKED');
    expect(await f.get.execute(f.params)).toEqual({ ...original, locked: true });
  });

  it('allows historical reads after access expiry but rejects foreign or unauthorized writes', async () => {
    const f = await fixture();
    const other = await db.tenant();
    const original = await f.update.execute(f.params, f.input);

    await expect(f.get.execute({ ...f.params, userId: other.userId })).rejects.toThrow('MEMBER_REQUIRED');
    await expect(f.update.execute({ ...f.params, userId: other.userId }, { ...f.input, version: 1 }))
      .rejects.toThrow('MEMBER_REQUIRED');

    await db.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId },
      data: { revokedAt: new Date() },
    });

    expect(await f.get.execute(f.params)).toEqual(original);
    await expect(f.update.execute(f.params, { ...f.input, version: 1 })).rejects.toThrow('SUBSCRIPTION_REQUIRED');
  });
});
