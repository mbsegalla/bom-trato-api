import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import {
  WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
  WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
  WorkOrderAcceptance,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import {
  createWorkOrderAcceptanceSnapshot,
  hashWorkOrderAcceptanceSnapshot,
  toPublicWorkOrderAcceptanceReceipt,
} from '../mappers/workOrderAcceptance.mapper.js';
import type { PublicWorkOrderReadContext } from '../ports/publicWorkOrderUnitOfWork.port.js';
import type { PublicWorkOrderSnapshot } from '../types/publicWorkOrder.types.js';
import type { PublicWorkOrderAcceptance } from '../types/workOrderAcceptance.types.js';

export async function resolvePublicWorkOrderAcceptance(
  context: PublicWorkOrderReadContext,
  workOrder: PublicWorkOrderSnapshot,
): Promise<PublicWorkOrderAcceptance> {
  const result: PublicWorkOrderAcceptance = {
    canAccept: false,
    snapshotHash: null,
    consentVersion: WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
    consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
    receipt: null,
  };

  if (workOrder.status !== WorkOrderStatus.COMPLETED || workOrder.completedAt === null) {
    return result;
  }

  const record = await context.acceptances.findForCompletion(workOrder.completedAt);

  if (record !== null) {
    return {
      ...result,
      receipt: WorkOrderAcceptance.restore(record).isCurrentFor(workOrder)
        ? toPublicWorkOrderAcceptanceReceipt(record)
        : null,
    };
  }

  const access = await context.findPlatformAccess();

  if (!access.hasAccess || access.billingNeedsReconciliation) {
    return result;
  }

  return {
    ...result,
    canAccept: true,
    snapshotHash: hashWorkOrderAcceptanceSnapshot(createWorkOrderAcceptanceSnapshot(workOrder)),
  };
}
