import type { ReceivablePagination } from '../../domain/types/receivablePage.types.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { FindReceivableParams } from '../types/receivable.types.js';

export class ListReceivablePaymentsUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: FindReceivableParams, page: ReceivablePagination) {
    const { receivableId } = params;

    return this.processor.read(params, async (context) => {
      await this.processor.load(context, receivableId);

      return context.receivables.listPayments(receivableId, page);
    });
  }
}
