import { randomUUID } from 'node:crypto';

import { Receivable } from '../../domain/entities/receivable.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import type { ReceivableActorParams } from '../ports/receivableUnitOfWork.port.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { CreateReceivableInput } from '../types/receivable.types.js';

export class CreateReceivableUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ReceivableActorParams, input: CreateReceivableInput) {
    const { workOrderId, dueAt, notes } = input;

    return this.processor.run(params, async (tx) => {
      const existing = await tx.receivables.findByWorkOrderId(workOrderId);

      if (existing !== null) {
        return Receivable.restore(existing).view(new Date());
      }

      const source = await tx.findWorkOrder(workOrderId);

      if (source === null) {
        throw new ReceivableError('WORK_ORDER_NOT_FOUND');
      }

      const now = new Date();

      const receivable = Receivable.create(
        {
          id: randomUUID(),
          organizationId: params.organizationId,
          userId: params.userId,
          source,
          dueAt: new Date(dueAt),
          notes,
        },
        now,
      );

      await tx.receivables.create(receivable);

      return receivable.view(now);
    });
  }
}
