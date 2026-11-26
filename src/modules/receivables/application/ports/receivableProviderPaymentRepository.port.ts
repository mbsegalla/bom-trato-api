import type {
  ProviderPaymentResult,
  RegisterProviderChargeInput,
  VerifiedProviderPayment,
} from '../../domain/types/receivableProviderPayment.types.js';
import type { FindReceivableParams } from '../types/receivable.types.js';

export abstract class ReceivableProviderPaymentRepository {
  abstract register(params: FindReceivableParams, input: RegisterProviderChargeInput): Promise<string>;
  abstract confirm(payment: VerifiedProviderPayment): Promise<ProviderPaymentResult>;
}
