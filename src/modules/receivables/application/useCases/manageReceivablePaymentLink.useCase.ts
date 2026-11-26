import type { ReceivablePaymentLinkRepository } from '../ports/receivablePaymentLinkRepository.port.js';
import type { FindReceivableParams } from '../types/receivable.types.js';

export class ManageReceivablePaymentLinkUseCase {
  constructor(private readonly repository: ReceivablePaymentLinkRepository) {}

  create(params: FindReceivableParams, version: number) {
    return this.repository.create(params, version);
  }

  status(params: FindReceivableParams) {
    return this.repository.status(params);
  }

  revoke(params: FindReceivableParams) {
    return this.repository.revoke(params);
  }

  resolve(token: string) {
    return this.repository.resolve(token);
  }
}
