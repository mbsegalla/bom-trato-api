import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { ReceivableApplicationService } from '../../../src/modules/receivables/application/services/receivableApplicationService.service.js';
import { GetReceivableUseCase } from '../../../src/modules/receivables/application/useCases/getReceivable.useCase.js';
import { RecordReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/reverseReceivablePayment.useCase.js';
import { PrismaReceivableRepository } from '../../../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';
import { PrismaReceivableUnitOfWork } from '../../../src/modules/receivables/infrastructure/transactions/prismaReceivableUnitOfWork.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('manual payment ledger (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();
  async function setup() {
    const f = await context.fixture();
    const service = new ReceivableApplicationService(new PrismaReceivableUnitOfWork(context.prisma));
    const params = { ...f.actor, version: f.receivable.version };
    const input = {
      requestId: randomUUID(),
      amountInCents: 3001,
      method: 'PIX' as const,
      receivedAt: new Date().toISOString(),
    };

    return {
      ...f,
      params,
      input,
      record: new RecordReceivablePaymentUseCase(service),
      reverse: new ReverseReceivablePaymentUseCase(service),
      get: new GetReceivableUseCase(service),
    };
  }

  it('applies concurrent retries once, even when the original version is stale', async () => {
    const f = await setup();
    const [first, second] = await Promise.all([
      f.record.execute(f.params, f.input),
      f.record.execute(f.params, f.input),
    ]);

    expect(first.payment.id).toBe(second.payment.id);
    expect(await context.ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 3001, version: 2, status: 'PARTIALLY_PAID' },
    });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(1);
    await expect(f.record.execute(f.params, { ...f.input, amountInCents: 3002 })).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
  }, 30000);

  it('rolls back the aggregate if inserting a payment fails', async () => {
    const f = await setup();
    const failure = vi
      .spyOn(PrismaReceivableRepository.prototype, 'createPayment')
      .mockRejectedValueOnce(new Error('fixture write failure'));

    await expect(f.record.execute(f.params, f.input)).rejects.toThrow('fixture write failure');

    failure.mockRestore();

    expect(await context.ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, version: 1 },
      payments: [],
    });

    await f.record.execute(f.params, f.input);

    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('reverses a payment exactly once and preserves the original ledger entry', async () => {
    const f = await setup();
    const recorded = await f.record.execute(f.params, f.input);
    await f.reverse.execute({ ...f.params, version: 2 }, recorded.payment.id, 'Fixture reversal');
    const state = await context.ledger(f.receivable.id);

    expect(state.receivable).toMatchObject({ receivedInCents: 0, version: 3, status: 'OPEN' });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]?.reversedAt).toBeInstanceOf(Date);
    await expect(
      f.reverse.execute({ ...f.params, version: 3 }, recorded.payment.id, 'Duplicate reversal'),
    ).rejects.toThrow('PAYMENT_ALREADY_REVERSED');
  });

  it('denies both a nonmember and a cross-organization receivable identifier', async () => {
    const f = await setup();
    const other = await context.fixture();

    await expect(f.get.execute({ ...f.actor, userId: other.actor.userId })).rejects.toThrow('MEMBER_REQUIRED');
    await expect(
      f.record.execute(
        {
          ...other.actor,
          receivableId: f.receivable.id,
          version: 1,
        },
        f.input,
      ),
    ).rejects.toThrow('RECEIVABLE_NOT_FOUND');
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });
});
