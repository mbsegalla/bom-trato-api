import { vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../../organizations/domain/policies/organizationAccess.policy.js';
import { Receivable, type ReceivableProps, type ReceivableSource } from '../../../domain/entities/receivable.entity.js';
import type { ReceivableRepository } from '../../../domain/repositories/receivable.repository.js';
import type { ReceivableTransaction, ReceivableUnitOfWork } from '../../ports/receivableUnitOfWork.port.js';
import { ReceivableApplicationService } from '../../services/receivableApplicationService.service.js';

export const actor = { organizationId: 'org', userId: 'owner' };
export const params = { ...actor, receivableId: 'receivable', version: 1 };
export const now = new Date('2020-01-01T00:00:00Z');
export const source: ReceivableSource = {
  id: 'order',
  organizationId: actor.organizationId,
  customerId: 'customer',
  customerName: 'Fixture customer',
  title: 'Fixture service',
  currency: 'brl',
  totalInCents: 10000,
  status: 'COMPLETED',
};
export const access: OrganizationAccessContext = {
  isMember: true,
  verified: true,
  hasPlatformAccess: true,
  source: 'TRIAL',
  billingNeedsReconciliation: false,
};

export function receivableState(overrides: Partial<ReceivableProps> = {}): ReceivableProps {
  const value = Receivable.create(
    {
      ...actor,
      id: params.receivableId,
      source,
      kind: 'FULL',
      amountInCents: source.totalInCents,
      dueAt: now,
    },
    now,
  );

  return { ...value.snapshot(), ...overrides };
}

export function receivableFixture(state = receivableState(), permissions = access) {
  const receivables = {
    create: vi.fn<ReceivableRepository['create']>().mockResolvedValue(undefined),
    findById: vi.fn<ReceivableRepository['findById']>().mockResolvedValue(state),
    findByWorkOrderId: vi.fn<ReceivableRepository['findByWorkOrderId']>().mockResolvedValue(null),
    findByWorkOrderIdAndKind: vi.fn<ReceivableRepository['findByWorkOrderIdAndKind']>().mockResolvedValue(null),
    listByWorkOrderId: vi.fn<ReceivableRepository['listByWorkOrderId']>().mockResolvedValue([]),
    list: vi.fn<ReceivableRepository['list']>().mockResolvedValue({ items: [state], page: 1, hasMore: false }),
    save: vi.fn<ReceivableRepository['save']>().mockResolvedValue(undefined),
    findPaymentById: vi.fn<ReceivableRepository['findPaymentById']>().mockResolvedValue(null),
    findPaymentByRequestId: vi.fn<ReceivableRepository['findPaymentByRequestId']>().mockResolvedValue(null),
    createPayment: vi.fn<ReceivableRepository['createPayment']>().mockResolvedValue(undefined),
    savePaymentReversal: vi.fn<ReceivableRepository['savePaymentReversal']>().mockResolvedValue(undefined),
    listPayments: vi
      .fn<ReceivableRepository['listPayments']>()
      .mockResolvedValue({ items: [], page: 1, hasMore: false }),
  };
  const findWorkOrder = vi.fn<ReceivableTransaction['findWorkOrder']>().mockResolvedValue(source);
  const tx: ReceivableTransaction = { access: permissions, receivables, findWorkOrder };
  const run = vi.fn(async (_actor: typeof actor, operation: (context: ReceivableTransaction) => Promise<unknown>) =>
    operation(tx),
  );
  const read = vi.fn(async (_actor: typeof actor, operation: (context: ReceivableTransaction) => Promise<unknown>) =>
    operation(tx),
  );

  return {
    receivables,
    findWorkOrder,
    run,
    read,
    service: new ReceivableApplicationService({ read, run } as unknown as ReceivableUnitOfWork),
  };
}
