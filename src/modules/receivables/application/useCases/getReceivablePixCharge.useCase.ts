import type { ReceivablePixChargeRepository } from '../ports/receivablePixChargeRepository.port.js';
import type { FindReceivableParams } from '../types/receivable.types.js';

export class GetReceivablePixChargeUseCase {
  constructor(private readonly repository: ReceivablePixChargeRepository) {}

  execute(params: FindReceivableParams) {
    return this.repository.read(params);
  }
}
