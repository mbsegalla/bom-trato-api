import type { Receivable, ReceivableProps } from '../entities/receivable.entity.js';
import type { ReceivablePayment, ReceivablePaymentProps } from '../entities/receivablePayment.entity.js';
import type { ReceivablePage, ReceivablePageParams, ReceivablePagination } from '../types/receivablePage.types.js';

export abstract class ReceivableRepository {
  abstract create(receivable: Receivable): Promise<void>;
  abstract findById(id: string): Promise<ReceivableProps | null>;
  abstract findByWorkOrderId(workOrderId: string): Promise<ReceivableProps | null>;
  abstract list(params: ReceivablePageParams): Promise<ReceivablePage<ReceivableProps>>;
  abstract save(receivable: Receivable, expectedVersion: number): Promise<void>;
  abstract findPaymentById(receivableId: string, paymentId: string): Promise<ReceivablePaymentProps | null>;
  abstract findPaymentByRequestId(receivableId: string, requestId: string): Promise<ReceivablePaymentProps | null>;
  abstract createPayment(payment: ReceivablePayment): Promise<void>;
  abstract savePaymentReversal(payment: ReceivablePayment): Promise<void>;
  abstract listPayments(
    receivableId: string,
    params: ReceivablePagination,
  ): Promise<ReceivablePage<ReceivablePaymentProps>>;
}
