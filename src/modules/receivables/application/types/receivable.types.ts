import type { ReceivablePaymentMethod, ReceivableStatus } from '../../../../generated/prisma/enums.js';
import type { ReceivableView } from '../../domain/entities/receivable.entity.js';
import type { ReceivablePaymentProps } from '../../domain/entities/receivablePayment.entity.js';
import type { ReceivableActorParams } from '../ports/receivableUnitOfWork.port.js';

export interface FindReceivableParams extends ReceivableActorParams {
  receivableId: string;
}

export interface ChangeReceivableParams extends FindReceivableParams {
  version: number;
}

export interface CreateReceivableInput {
  workOrderId: string;
  dueAt: string;
  notes?: string | null;
}

export interface UpdateReceivableInput {
  dueAt?: string;
  notes?: string | null;
}

export interface RecordReceivablePaymentInput {
  requestId: string;
  amountInCents: number;
  method: ReceivablePaymentMethod;
  receivedAt: string;
  notes?: string | null;
}

export interface ListReceivablesInput {
  page: number;
  limit: number;
  status?: ReceivableStatus;
  customerId?: string;
  workOrderId?: string;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
}

export interface ReceivablePaymentResult {
  receivable: ReceivableView;
  payment: ReceivablePaymentProps;
}
