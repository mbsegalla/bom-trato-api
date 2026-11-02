import { ReceivableKind } from '../../../../generated/prisma/enums.js';
import { Receivable } from '../../domain/entities/receivable.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import type { ReceivableActorParams } from '../ports/receivableUnitOfWork.port.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import { ensureReceivableFromWorkOrder } from '../services/receivableCreation.service.js';
import type { CreateReceivableInput } from '../types/receivable.types.js';

export class CreateReceivableUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ReceivableActorParams, input: CreateReceivableInput) {
    const { workOrderId, dueAt, notes } = input;

    return this.processor.run(params, async (tx) => {
      const source = await tx.findWorkOrder(workOrderId);

      if (source === null) {
        throw new ReceivableError('WORK_ORDER_NOT_FOUND');
      }

      const now = new Date();

      const existing = await tx.receivables.listByWorkOrderId(workOrderId);

      if (existing.length > 0) {
        const full = existing.find((receivable) => receivable.kind === ReceivableKind.FULL);

        if (full !== undefined && existing.length === 1) {
          return Receivable.restore(full).view(now);
        }

        throw new ReceivableError('RECEIVABLE_ALREADY_EXISTS');
      }

      return ensureReceivableFromWorkOrder({
        receivables: tx.receivables,
        organizationId: params.organizationId,
        userId: params.userId,
        source,
        kind: ReceivableKind.FULL,
        amountInCents: source.totalInCents,
        dueAt: new Date(dueAt),
        notes,
        now,
      });
    });
  }
}
