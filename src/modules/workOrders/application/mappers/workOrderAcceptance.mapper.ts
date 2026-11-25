import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { sha256Hex } from '../../../../shared/security/hmac.js';
import type {
  WorkOrderAcceptanceProps,
  WorkOrderAcceptanceSnapshot,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import {
  WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
  WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import { WorkOrderAcceptanceError } from '../../domain/errors/workOrderAcceptance.error.js';
import type { PublicWorkOrderSnapshot } from '../types/publicWorkOrder.types.js';
import type {
  PublicWorkOrderAcceptanceReceipt,
  WorkOrderAcceptanceReceipt,
} from '../types/workOrderAcceptance.types.js';

export function createWorkOrderAcceptanceSnapshot(source: PublicWorkOrderSnapshot): WorkOrderAcceptanceSnapshot {
  if (source.status !== WorkOrderStatus.COMPLETED || source.completedAt === null) {
    throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');
  }

  return {
    schemaVersion: 1,
    organizationName: source.organization.name,
    workOrder: {
      title: source.title,
      currency: source.currency,
      subtotalInCents: source.subtotalInCents,
      discountInCents: source.discountInCents,
      totalInCents: source.totalInCents,
      completedAt: source.completedAt.toISOString(),
      version: source.version,
      items: source.items.map((item) => ({
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantityInThousandths: item.quantityInThousandths,
        unitAmountInCents: item.unitAmountInCents,
        totalInCents: item.totalInCents,
        position: item.position,
      })),
    },
  };
}

export function hashWorkOrderAcceptanceSnapshot(snapshot: WorkOrderAcceptanceSnapshot): string {
  return sha256Hex(
    JSON.stringify({
      consentVersion: WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
      consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
      snapshot,
    }),
  );
}

export function toPublicWorkOrderAcceptanceReceipt(
  acceptance: WorkOrderAcceptanceProps,
): PublicWorkOrderAcceptanceReceipt {
  return { acceptedAt: acceptance.acceptedAt, completedAt: acceptance.completedAt };
}

export function toWorkOrderAcceptanceReceipt(acceptance: WorkOrderAcceptanceProps): WorkOrderAcceptanceReceipt {
  return {
    id: acceptance.id,
    signerName: acceptance.signerName,
    acceptedAt: acceptance.acceptedAt,
    completedAt: acceptance.completedAt,
    workOrderVersion: acceptance.workOrderVersion,
    consentVersion: acceptance.consentVersion,
    consentText: acceptance.consentText,
    snapshotHash: acceptance.snapshotHash,
    snapshot: structuredClone(acceptance.snapshot),
  };
}
