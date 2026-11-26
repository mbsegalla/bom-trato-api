import { describe, expect, it } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import { ReceivablePayment } from '../../domain/entities/receivablePayment.entity.js';

import { now, params, receivableFixture, receivableState } from './support/receivable.fixture.js';
import { CancelReceivableUseCase } from './cancelReceivable.useCase.js';
import { RecordReceivablePaymentUseCase } from './recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from './reverseReceivablePayment.useCase.js';
import { UpdateReceivableUseCase } from './updateReceivable.useCase.js';

const input = {
  requestId: 'fixture-request',
  amountInCents: 3000,
  method: 'PIX' as const,
  receivedAt: now.toISOString(),
  notes: 'Fixture payment',
};
const payment = ReceivablePayment.create(
  {
    ...input,
    id: 'payment',
    receivableId: params.receivableId,
    receivedAt: now,
    recordedById: params.userId,
  },
  now,
).snapshot();

describe('receivable mutations', () => {
  it('updates only mutable details and advances the optimistic version', async () => {
    const f = receivableFixture();

    const result = await new UpdateReceivableUseCase(f.service).execute(params, {
      dueAt: '2030-01-01T00:00:00Z',
      notes: '  Updated note  ',
    });

    expect(result).toMatchObject({
      version: 2,
      amountInCents: 10000,
      receivedInCents: 0,
      notes: 'Updated note',
      dueAt: new Date('2030-01-01T00:00:00Z'),
      updatedById: params.userId,
    });
    expect(f.receivables.save.mock.calls[0][1]).toBe(1);
  });

  it('rejects stale edits and cannot edit a fully paid receivable', async () => {
    const f = receivableFixture();
    const update = new UpdateReceivableUseCase(f.service);

    await expect(update.execute({ ...params, version: 2 }, { notes: 'Changed' })).rejects.toThrow(
      'RECEIVABLE_VERSION_CONFLICT',
    );

    f.receivables.findById.mockResolvedValueOnce(receivableState({ status: 'PAID', receivedInCents: 10000 }));

    await expect(update.execute(params, { notes: 'Changed' })).rejects.toThrow('RECEIVABLE_NOT_EDITABLE');
    expect(f.receivables.save).not.toHaveBeenCalled();
  });

  it('cancels an unpaid receivable with an audit reason but preserves receivables with active money', async () => {
    const f = receivableFixture();
    const cancel = new CancelReceivableUseCase(f.service);

    f.receivables.findById.mockResolvedValueOnce(receivableState({ status: 'PARTIALLY_PAID', receivedInCents: 1 }));

    await expect(cancel.execute(params, 'Fixture cancellation')).rejects.toThrow('RECEIVABLE_HAS_PAYMENTS');
    expect(f.receivables.save).not.toHaveBeenCalled();

    expect(await cancel.execute(params, '  Fixture cancellation  ')).toMatchObject({
      status: 'CANCELED',
      balanceInCents: 0,
      overdue: false,
      cancellationReason: 'Fixture cancellation',
      canceledById: params.userId,
      version: 2,
    });
  });

  it('returns a successful payment replay even with the original stale version', async () => {
    const f = receivableFixture(receivableState({ version: 2, status: 'PARTIALLY_PAID', receivedInCents: 3000 }));
    f.receivables.findPaymentByRequestId.mockResolvedValueOnce(payment);

    const result = await new RecordReceivablePaymentUseCase(f.service).execute(params, input);

    expect(result.payment).toEqual(payment);
    expect(result.receivable).toMatchObject({ version: 2, receivedInCents: 3000, balanceInCents: 7000 });
    expect(f.receivables.save).not.toHaveBeenCalled();
    expect(f.receivables.createPayment).not.toHaveBeenCalled();
  });

  it('rejects reuse of a request identity with changed amounts or notes', async () => {
    const f = receivableFixture();
    f.receivables.findPaymentByRequestId.mockResolvedValue(payment);
    const record = new RecordReceivablePaymentUseCase(f.service);

    await expect(record.execute(params, { ...input, amountInCents: 3001 })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(record.execute(params, { ...input, notes: 'Different' })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(f.receivables.save).not.toHaveBeenCalled();
    expect(f.receivables.createPayment).not.toHaveBeenCalled();
  });

  it('rejects new stale or excessive payments and does not insert a ledger entry', async () => {
    const f = receivableFixture(receivableState({ version: 2, status: 'PARTIALLY_PAID', receivedInCents: 3000 }));
    const record = new RecordReceivablePaymentUseCase(f.service);

    await expect(record.execute(params, input)).rejects.toThrow('RECEIVABLE_VERSION_CONFLICT');
    await expect(record.execute({ ...params, version: 2 }, { ...input, amountInCents: 7001 })).rejects.toThrow(
      'PAYMENT_EXCEEDS_BALANCE',
    );
    expect(f.receivables.save).not.toHaveBeenCalled();
    expect(f.receivables.createPayment).not.toHaveBeenCalled();
  });

  it('does not reverse missing or already reversed payments', async () => {
    const f = receivableFixture(receivableState({ status: 'PARTIALLY_PAID', receivedInCents: 3000 }));
    const reverse = new ReverseReceivablePaymentUseCase(f.service);

    await expect(reverse.execute(params, payment.id, 'Fixture reversal')).rejects.toThrow('PAYMENT_NOT_FOUND');

    f.receivables.findPaymentById.mockResolvedValueOnce({
      ...payment,
      reversedAt: now,
      reversedById: params.userId,
      reversalReason: 'Previous reversal',
    });

    await expect(reverse.execute(params, payment.id, 'Fixture reversal')).rejects.toThrow('PAYMENT_ALREADY_REVERSED');
    expect(f.receivables.save).not.toHaveBeenCalled();
    expect(f.receivables.savePaymentReversal).not.toHaveBeenCalled();
  });

  it('reopens the balance and records reversal metadata without deleting the original payment', async () => {
    const f = receivableFixture(receivableState({ status: 'PARTIALLY_PAID', receivedInCents: 3000 }));
    f.receivables.findPaymentById.mockResolvedValueOnce(payment);

    const result = await new ReverseReceivablePaymentUseCase(f.service).execute(params, payment.id, 'Fixture reversal');

    expect(result.receivable).toMatchObject({ status: 'OPEN', balanceInCents: 10000, receivedInCents: 0, version: 2 });
    expect(result.payment).toMatchObject({
      id: payment.id,
      amountInCents: 3000,
      reversedAt: asymmetric.any(Date),
      reversedById: params.userId,
      reversalReason: 'Fixture reversal',
    });
    expect(f.receivables.savePaymentReversal.mock.calls[0][0].snapshot()).toEqual(result.payment);
  });
});
