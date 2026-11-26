import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';

import { ReceivableApplicationService } from '../../../src/modules/receivables/application/services/receivableApplicationService.service.js';
import { RecordReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/reverseReceivablePayment.useCase.js';
import { PrismaReceivableRepository } from '../../../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';
import { PrismaReceivableUnitOfWork } from '../../../src/modules/receivables/infrastructure/transactions/prismaReceivableUnitOfWork.js';
import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('payment ledger concurrency (disposable PostgreSQL)', () => {
  const db = createPaymentFixture();

  async function setup() {
    const f = await db.fixture();
    const service = new ReceivableApplicationService(new PrismaReceivableUnitOfWork(db.prisma));
    const params = { ...f.actor, version: f.receivable.version };
    const input = {
      requestId: randomUUID(),
      amountInCents: 6000,
      method: 'PIX' as const,
      receivedAt: new Date().toISOString(),
    };

    return {
      ...f,
      params,
      input,
      record: new RecordReceivablePaymentUseCase(service),
      reverse: new ReverseReceivablePaymentUseCase(service),
    };
  }

  it('accepts only one of two distinct concurrent payments using the same receivable version', async () => {
    const f = await setup();
    const results = await Promise.allSettled([
      f.record.execute(f.params, f.input),
      f.record.execute(f.params, { ...f.input, requestId: randomUUID() }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const ledger = await db.ledger(f.receivable.id);

    expect(ledger.receivable).toMatchObject({ receivedInCents: 6000, version: 2, status: 'PARTIALLY_PAID' });
    expect(ledger.payments).toHaveLength(1);
  }, 30000);

  it('rejects overpayment after a valid partial payment without writing a second ledger entry', async () => {
    const f = await setup();

    await f.record.execute(f.params, f.input);
    await expect(f.record.execute({ ...f.params, version: 2 }, {
      ...f.input, requestId: randomUUID(), amountInCents: 4001,
    })).rejects.toThrow('PAYMENT_EXCEEDS_BALANCE');

    const ledger = await db.ledger(f.receivable.id);

    expect(ledger.receivable).toMatchObject({ receivedInCents: 6000, version: 2 });
    expect(ledger.payments).toHaveLength(1);
  });

  it('rolls back a failed reversal and allows a subsequent successful reversal', async () => {
    const f = await setup();
    const result = await f.record.execute(f.params, f.input);
    const params = { ...f.params, version: 2 };
    const failure = vi.spyOn(PrismaReceivableRepository.prototype, 'savePaymentReversal')
      .mockRejectedValueOnce(new Error('Fixture reversal write failure'));

    try {
      await expect(f.reverse.execute(params, result.payment.id, 'Fixture reversal'))
        .rejects.toThrow('Fixture reversal write failure');
    } finally {
      failure.mockRestore();
    }

    const before = await db.ledger(f.receivable.id);

    expect(before.receivable).toMatchObject({ receivedInCents: 6000, version: 2 });
    expect(before.payments[0]?.reversedAt).toBeNull();

    await f.reverse.execute(params, result.payment.id, 'Fixture reversal');

    const after = await db.ledger(f.receivable.id);

    expect(after.receivable).toMatchObject({ receivedInCents: 0, version: 3, status: 'OPEN' });
    expect(after.payments[0]?.reversedAt).toBeInstanceOf(Date);
  });
});
