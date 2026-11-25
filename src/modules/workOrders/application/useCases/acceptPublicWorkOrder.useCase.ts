import { randomUUID } from 'node:crypto';

import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { AcceptWorkOrderInput } from '../../domain/entities/workOrderAcceptance.entity.js';
import {
  WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
  WorkOrderAcceptance,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import { WorkOrderShare } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderAcceptanceError } from '../../domain/errors/workOrderAcceptance.error.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';
import {
  createWorkOrderAcceptanceSnapshot,
  hashWorkOrderAcceptanceSnapshot,
  toPublicWorkOrderAcceptanceReceipt,
} from '../mappers/workOrderAcceptance.mapper.js';
import type { PublicWorkOrderUnitOfWork } from '../ports/publicWorkOrderUnitOfWork.port.js';
import type { WorkOrderShareSecurity } from '../ports/workOrderShareSecurity.port.js';
import type { PublicWorkOrderAcceptanceReceipt } from '../types/workOrderAcceptance.types.js';

export class AcceptPublicWorkOrderUseCase {
  constructor(
    private readonly unitOfWork: PublicWorkOrderUnitOfWork,
    private readonly security: WorkOrderShareSecurity,
  ) {}

  execute(token: string, input: AcceptWorkOrderInput): Promise<PublicWorkOrderAcceptanceReceipt> {
    const hash = this.security.hash(token);
    const normalized = WorkOrderAcceptance.normalizeInput(input);

    return this.unitOfWork.run(hash, async (tx) => {
      const share = WorkOrderShare.restore(tx.share);

      if (!share.isReadableAt(new Date())) {
        throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
      }

      const workOrder = await tx.findWorkOrder();

      if (workOrder === null) {
        throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
      }

      share.assertReadable(workOrder.organizationId, workOrder.id, new Date());

      if (workOrder.status !== WorkOrderStatus.COMPLETED || workOrder.completedAt === null) {
        throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');
      }

      const record = await tx.acceptances.findForCompletion(workOrder.completedAt);

      if (record !== null) {
        const acceptance = WorkOrderAcceptance.restore(record);

        if (!acceptance.isCurrentFor(workOrder)) {
          throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');
        }

        acceptance.assertReplay(normalized);
        share.assertReadable(workOrder.organizationId, workOrder.id, new Date());

        return toPublicWorkOrderAcceptanceReceipt(acceptance.snapshot());
      }

      const access = await tx.findPlatformAccess();

      if (access.billingNeedsReconciliation) {
        throw new WorkOrderError('BILLING_RECONCILIATION_REQUIRED');
      }

      if (!access.hasAccess) {
        throw new WorkOrderError('SUBSCRIPTION_REQUIRED');
      }

      const snapshot = createWorkOrderAcceptanceSnapshot(workOrder);
      const snapshotHash = hashWorkOrderAcceptanceSnapshot(snapshot);

      if (
        normalized.consentVersion !== WORK_ORDER_ACCEPTANCE_CONSENT_VERSION ||
        normalized.snapshotHash !== snapshotHash
      ) {
        throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT');
      }

      const now = new Date();

      share.assertReadable(workOrder.organizationId, workOrder.id, now);

      const acceptance = WorkOrderAcceptance.create(
        {
          id: randomUUID(),
          organizationId: workOrder.organizationId,
          workOrderId: workOrder.id,
          shareId: tx.share.id,
          snapshot,
        },
        normalized,
        now,
      );

      await tx.acceptances.create(acceptance);

      return toPublicWorkOrderAcceptanceReceipt(acceptance.snapshot());
    });
  }
}
