import type { ReceivableSource } from '../../domain/entities/receivable.entity.js';
import type { ReceivableAccessContext } from '../../domain/policies/receivableAccess.policy.js';
import type { ReceivableRepository } from '../../domain/repositories/receivable.repository.js';

export interface ReceivableActorParams {
  organizationId: string;
  userId: string;
}

export interface ReceivableReadContext {
  receivables: Pick<ReceivableRepository, 'findById' | 'list' | 'listPayments'>;
  access: ReceivableAccessContext;
}

export interface ReceivableTransaction {
  receivables: ReceivableRepository;
  access: ReceivableAccessContext;
  findWorkOrder(id: string): Promise<ReceivableSource | null>;
}

export abstract class ReceivableUnitOfWork {
  abstract read<T>(
    params: ReceivableActorParams,
    operation: (context: ReceivableReadContext) => Promise<T>,
  ): Promise<T>;
  abstract run<T>(params: ReceivableActorParams, operation: (tx: ReceivableTransaction) => Promise<T>): Promise<T>;
}
