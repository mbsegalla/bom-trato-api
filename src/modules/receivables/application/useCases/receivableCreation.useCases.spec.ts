import { describe, expect, it } from 'vitest';

import { actor, now, receivableFixture, receivableState, source } from './support/receivable.fixture.js';
import { CreateReceivableUseCase } from './createReceivable.useCase.js';

const input = { workOrderId: source.id, dueAt: now.toISOString(), notes: '  Fixture note  ' };

describe('CreateReceivableUseCase', () => {
  it('creates the full amount from the trusted work order, not caller-supplied financial values', async () => {
    const f = receivableFixture();

    const result = await new CreateReceivableUseCase(f.service).execute(actor, input);

    expect(result).toMatchObject({
      organizationId: actor.organizationId,
      workOrderId: source.id,
      customerId: source.customerId,
      kind: 'FULL',
      amountInCents: 10000,
      balanceInCents: 10000,
      receivedInCents: 0,
      status: 'OPEN',
      notes: 'Fixture note',
      version: 1,
    });
    expect(f.findWorkOrder).toHaveBeenCalledWith(source.id);
    expect(f.receivables.create.mock.calls[0][0].snapshot()).toMatchObject({ id: result.id, amountInCents: 10000 });
  });

  it('returns an existing full receivable without writing a duplicate', async () => {
    const state = receivableState();
    const f = receivableFixture(state);
    f.receivables.listByWorkOrderId.mockResolvedValueOnce([state]);

    const result = await new CreateReceivableUseCase(f.service).execute(actor, input);

    expect(result.id).toBe(state.id);
    expect(f.receivables.create).not.toHaveBeenCalled();
  });

  it('rejects manual full creation if the order already has split installments', async () => {
    const f = receivableFixture();
    f.receivables.listByWorkOrderId.mockResolvedValueOnce([
      receivableState({ kind: 'DOWN_PAYMENT', amountInCents: 3000 }),
    ]);

    await expect(new CreateReceivableUseCase(f.service).execute(actor, input)).rejects.toThrow(
      'RECEIVABLE_ALREADY_EXISTS',
    );
    expect(f.receivables.create).not.toHaveBeenCalled();
  });

  it('rejects missing, foreign or canceled work orders before creating receivables', async () => {
    const f = receivableFixture();
    const create = new CreateReceivableUseCase(f.service);

    f.findWorkOrder.mockResolvedValueOnce(null);
    await expect(create.execute(actor, input)).rejects.toThrow('WORK_ORDER_NOT_FOUND');

    f.findWorkOrder.mockResolvedValueOnce({ ...source, organizationId: 'other' });
    await expect(create.execute(actor, input)).rejects.toThrow('WORK_ORDER_NOT_FOUND');

    f.findWorkOrder.mockResolvedValueOnce({ ...source, status: 'CANCELED' });
    await expect(create.execute(actor, input)).rejects.toThrow('WORK_ORDER_CANCELED');

    expect(f.receivables.create).not.toHaveBeenCalled();
  });
});
