import type { WorkOrderAcceptanceProps } from '../../domain/entities/workOrderAcceptance.entity.js';

export type PublicWorkOrderAcceptanceReceipt = Pick<WorkOrderAcceptanceProps, 'acceptedAt' | 'completedAt'>;

export type WorkOrderAcceptanceReceipt = Omit<WorkOrderAcceptanceProps, 'organizationId' | 'workOrderId' | 'shareId'>;

export interface PublicWorkOrderAcceptance {
  canAccept: boolean;
  snapshotHash: string | null;
  consentVersion: string;
  consentText: string;
  receipt: PublicWorkOrderAcceptanceReceipt | null;
}

export interface WorkOrderAcceptanceResult {
  receipt: WorkOrderAcceptanceReceipt | null;
}
