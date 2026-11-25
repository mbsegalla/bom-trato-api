import { randomUUID } from 'node:crypto';

import { WorkOrderShare } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderShareSecurity } from '../ports/workOrderShareSecurity.port.js';
import type { WorkOrderShareApplicationService } from '../services/workOrderShareApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class CreateWorkOrderShareUseCase {
  constructor(
    private readonly processor: WorkOrderShareApplicationService,
    private readonly security: WorkOrderShareSecurity,
  ) {}

  execute(params: ChangeWorkOrderParams, expiresAt: string) {
    return this.processor.run(params, async (tx, workOrder) => {
      if (workOrder.version !== params.version) {
        throw new WorkOrderError('WORK_ORDER_VERSION_CONFLICT');
      }

      const now = new Date();
      const issued = this.security.issue();

      const share = WorkOrderShare.create(
        {
          id: randomUUID(),
          organizationId: workOrder.organizationId,
          workOrderId: workOrder.id,
          tokenHash: issued.hash,
          userId: params.userId,
          expiresAt: new Date(expiresAt),
        },
        now,
      );

      await tx.shares.revokeForWorkOrder(workOrder.id, now);
      await tx.shares.create(share);

      const state = share.snapshot();

      return {
        id: state.id,
        token: issued.token,
        createdAt: state.createdAt,
        expiresAt: state.expiresAt,
      };
    });
  }
}
