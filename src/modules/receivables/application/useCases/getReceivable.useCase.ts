import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { FindReceivableParams } from '../types/receivable.types.js';

export class GetReceivableUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: FindReceivableParams) {
    return this.processor.read(params, async (context) => {
      const receivable = await this.processor.load(context, params.receivableId);

      return receivable.view(new Date());
    });
  }
}
