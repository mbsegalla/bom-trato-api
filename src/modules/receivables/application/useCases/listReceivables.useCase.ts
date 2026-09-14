import { Receivable } from '../../domain/entities/receivable.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import { assertReceivableDate } from '../../domain/validation/receivable.validation.js';
import type { ReceivableActorParams } from '../ports/receivableUnitOfWork.port.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { ListReceivablesInput } from '../types/receivable.types.js';

export class ListReceivablesUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ReceivableActorParams, input: ListReceivablesInput) {
    return this.processor.read(params, async (context) => {
      const dueFrom = input.dueFrom === undefined ? undefined : new Date(input.dueFrom);
      const dueTo = input.dueTo === undefined ? undefined : new Date(input.dueTo);

      if (dueFrom !== undefined) {
        assertReceivableDate(dueFrom);
      }

      if (dueTo !== undefined) {
        assertReceivableDate(dueTo);
      }

      if (dueFrom !== undefined && dueTo !== undefined && dueFrom > dueTo) {
        throw new ReceivableError('INVALID_RECEIVABLE_DATE');
      }

      const now = new Date();

      const result = await context.receivables.list({
        ...input,
        dueFrom,
        dueTo,
        now,
      });

      return {
        ...result,
        items: result.items.map((state) => Receivable.restore(state).view(now)),
      };
    });
  }
}
