import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { ChangeReceivableParams } from '../types/receivable.types.js';

export class CancelReceivableUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ChangeReceivableParams, reason: string) {
    return this.processor.mutate(params, (receivable, now) => {
      receivable.cancel(params.userId, reason, now);
    });
  }
}
