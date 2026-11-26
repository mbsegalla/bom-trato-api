import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

import { PrismaDashboardRepository } from '../../../src/modules/dashboard/infrastructure/repositories/prismaDashboard.repository.js';
import { ReceivableApplicationService } from '../../../src/modules/receivables/application/services/receivableApplicationService.service.js';
import { RecordReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/reverseReceivablePayment.useCase.js';
import { PrismaReceivableUnitOfWork } from '../../../src/modules/receivables/infrastructure/transactions/prismaReceivableUnitOfWork.js';
import { createPaymentFixture, paymentIntegrationSuite } from '../receivables/support/payment.fixture.js';

paymentIntegrationSuite('dashboard financial aggregates (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  it('counts only the current tenant and excludes reversed receipts from aggregates', async () => {
    const a = await context.fixture();
    const b = await context.fixture();
    const service = new ReceivableApplicationService(new PrismaReceivableUnitOfWork(context.prisma));
    const record = new RecordReceivablePaymentUseCase(service);
    const reverse = new ReverseReceivablePaymentUseCase(service);
    const now = new Date();
    const aResult = await record.execute({ ...a.actor, version: 1 }, { requestId: randomUUID(), amountInCents: 3001, method: 'PIX', receivedAt: now.toISOString() });
    await record.execute({ ...b.actor, version: 1 }, { requestId: randomUUID(), amountInCents: 1234, method: 'PIX', receivedAt: now.toISOString() });
    const period = { from: new Date(now.getTime() - 60000), to: new Date(now.getTime() + 60000) };
    const repository = new PrismaDashboardRepository(context.prisma, a.actor.organizationId);
    expect(await repository.financial(period, period.to)).toMatchObject({ currentReceivables: { pendingCount: 1, pendingAmountInCents: 6999, overdueCount: 1, overdueAmountInCents: 6999 }, periodReceipts: { count: 1, amountInCents: 3001 } });
    expect(await repository.summary(period, now)).toMatchObject({ workOrders: { open: 1, scheduled: 0 }, quotes: { draft: 0 } });
    await reverse.execute({ ...a.actor, version: 2 }, aResult.payment.id, 'Fixture reversal');
    expect(await repository.financial(period, period.to)).toMatchObject({ currentReceivables: { pendingAmountInCents: 10000 }, periodReceipts: { count: 0, amountInCents: 0 } });
    expect(await new PrismaDashboardRepository(context.prisma, b.actor.organizationId).financial(period, period.to)).toMatchObject({ periodReceipts: { count: 1, amountInCents: 1234 } });
  });
});
