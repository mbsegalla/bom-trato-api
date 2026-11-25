import type { ServiceUnit, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';

export interface WorkOrderWarranty {
  durationDays: number;
  terms: string;
  version: number;
  expiresAt: Date | null;
}

export interface WorkOrderDocumentData {
  organizationName: string;
  workOrder: {
    id: string | null;
    title: string;
    customerName: string | null;
    status: WorkOrderStatus;
    completedAt: Date | null;
    createdAt: Date;
    currency: string;
    subtotalInCents: number;
    discountInCents: number;
    totalInCents: number;
    version: number | null;
    items: {
      name: string;
      description: string | null;
      unit: ServiceUnit;
      quantityInThousandths: number;
      unitAmountInCents: number;
      totalInCents: number;
      position: number;
    }[];
  };
  warranty: Pick<WorkOrderWarranty, 'durationDays' | 'terms' | 'expiresAt'> | null;
  acceptedBy: string | null;
  acceptedAt: Date | null;
}

export interface InternalWorkOrderDocumentData extends WorkOrderDocumentData {
  warranty: WorkOrderWarranty | null;
}

export interface WorkOrderDocumentContext {
  access: OrganizationAccessContext;
  data: InternalWorkOrderDocumentData;
  accepted: boolean;
}

export interface UpdateWorkOrderWarrantyInput {
  durationDays: number;
  terms: string;
  version: number;
}

export interface WorkOrderWarrantyResult {
  warranty: WorkOrderWarranty | null;
  locked: boolean;
}

export interface WorkOrderDocumentFile {
  filename: string;
  content: Uint8Array;
}
