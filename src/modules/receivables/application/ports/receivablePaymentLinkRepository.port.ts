import type { FindReceivableParams } from '../types/receivable.types.js';
import type {
  CreatedReceivablePaymentLink,
  PublicReceivablePaymentLink,
  ReceivablePaymentLinkStatus,
} from '../types/receivablePaymentLink.types.js';

export abstract class ReceivablePaymentLinkRepository {
  abstract create(params: FindReceivableParams, version: number): Promise<CreatedReceivablePaymentLink>;
  abstract status(params: FindReceivableParams): Promise<ReceivablePaymentLinkStatus | null>;
  abstract revoke(params: FindReceivableParams): Promise<void>;
  abstract resolve(token: string): Promise<PublicReceivablePaymentLink>;
}
