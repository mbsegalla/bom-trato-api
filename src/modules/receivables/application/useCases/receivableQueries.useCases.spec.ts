import { describe, expect, it } from 'vitest';

import { access, actor, params, receivableFixture, receivableState } from './support/receivable.fixture.js';
import { GetReceivableUseCase } from './getReceivable.useCase.js';
import { ListReceivablePaymentsUseCase } from './listReceivablePayments.useCase.js';
import { ListReceivablesUseCase } from './listReceivables.useCase.js';

describe('receivable read use cases', () => {
  it('computes outstanding balance and overdue state from persisted financial amounts', async () => {
    const state = receivableState({ status: 'PARTIALLY_PAID', receivedInCents: 2501 });
    const f = receivableFixture(state);

    const value = await new GetReceivableUseCase(f.service).execute(params);

    expect(value).toMatchObject({ balanceInCents: 7499, overdue: true, receivedInCents: 2501 });
    expect(f.receivables.findById).toHaveBeenCalledWith(params.receivableId);
  });

  it('maps date filters and page metadata while preserving integer-cent balances', async () => {
    const state = receivableState({ status: 'PARTIALLY_PAID', receivedInCents: 2500 });
    const f = receivableFixture(state);
    f.receivables.list.mockResolvedValueOnce({ items: [state], page: 2, hasMore: true });

    const input = {
      page: 2,
      limit: 10,
      dueFrom: '2020-01-01T00:00:00Z',
      dueTo: '2030-01-01T00:00:00Z',
      overdue: true,
    };
    const result = await new ListReceivablesUseCase(f.service).execute(actor, input);

    expect(result).toMatchObject({ page: 2, hasMore: true, items: [{ balanceInCents: 7500, overdue: true }] });
    expect(f.receivables.list).toHaveBeenCalledWith({
      ...input,
      dueFrom: new Date(input.dueFrom),
      dueTo: new Date(input.dueTo),
      now: expect.any(Date),
    });
  });

  it('rejects invalid or inverted periods before listing records', async () => {
    const f = receivableFixture();
    const list = new ListReceivablesUseCase(f.service);

    for (const period of [
      { dueFrom: 'invalid' },
      { dueTo: 'invalid' },
      { dueFrom: '2030-01-01T00:00:00Z', dueTo: '2029-01-01T00:00:00Z' },
    ]) {
      await expect(list.execute(actor, { page: 1, limit: 10, ...period })).rejects.toThrow('INVALID_RECEIVABLE_DATE');
    }

    expect(f.receivables.list).not.toHaveBeenCalled();
  });

  it('requires a scoped receivable before disclosing its payment history', async () => {
    const f = receivableFixture();
    const list = new ListReceivablePaymentsUseCase(f.service);
    const page = { page: 2, limit: 10 };
    f.receivables.findById.mockResolvedValueOnce(null);

    await expect(list.execute(params, page)).rejects.toThrow('RECEIVABLE_NOT_FOUND');
    expect(f.receivables.listPayments).not.toHaveBeenCalled();

    f.receivables.listPayments.mockResolvedValueOnce({ items: [], page: 2, hasMore: false });

    expect(await list.execute(params, page)).toEqual({ items: [], page: 2, hasMore: false });
    expect(f.receivables.listPayments).toHaveBeenCalledWith(params.receivableId, page);
  });

  it.each([
    [{ isMember: false }, 'MEMBER_REQUIRED'],
    [{ verified: false }, 'VERIFIED_USER_REQUIRED'],
    [{ billingNeedsReconciliation: true }, 'BILLING_RECONCILIATION_REQUIRED'],
    [{ hasPlatformAccess: false }, 'SUBSCRIPTION_REQUIRED'],
  ] as const)('denies restricted access before reading financial data: %j', async (override, code) => {
    const f = receivableFixture(receivableState(), { ...access, ...override });

    await expect(new GetReceivableUseCase(f.service).execute(params)).rejects.toThrow(code);
    await expect(new ListReceivablesUseCase(f.service).execute(actor, { page: 1, limit: 10 })).rejects.toThrow(code);
    expect(f.receivables.findById).not.toHaveBeenCalled();
    expect(f.receivables.list).not.toHaveBeenCalled();
  });
});
