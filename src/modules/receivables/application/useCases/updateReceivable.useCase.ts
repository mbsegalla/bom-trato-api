import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { ChangeReceivableParams, UpdateReceivableInput } from '../types/receivable.types.js';

export class UpdateReceivableUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ChangeReceivableParams, input: UpdateReceivableInput) {
    const { dueAt, notes } = input;

    return this.processor.mutate(params, (receivable) => {
      receivable.update({
        dueAt: dueAt === undefined ? undefined : new Date(dueAt),
        notes,
      });
    });
  }
}
