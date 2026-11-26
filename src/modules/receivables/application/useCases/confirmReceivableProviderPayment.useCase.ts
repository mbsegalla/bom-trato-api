import type {
  RegisterProviderChargeInput,
  VerifiedProviderPayment,
} from '../../domain/types/receivableProviderPayment.types.js';
import type { ReceivableProviderPaymentRepository } from '../ports/receivableProviderPaymentRepository.port.js';
import type { FindReceivableParams } from '../types/receivable.types.js';

export class ConfirmReceivableProviderPaymentUseCase {
  constructor(private readonly repository: ReceivableProviderPaymentRepository) {}

  register(params: FindReceivableParams, input: RegisterProviderChargeInput) {
    return this.repository.register(params, input);
  }

  execute(payment: VerifiedProviderPayment) {
    return this.repository.confirm(payment);
  }
}
