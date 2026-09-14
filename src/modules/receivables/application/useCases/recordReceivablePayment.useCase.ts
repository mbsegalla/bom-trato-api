import { randomUUID } from 'node:crypto';

import { ReceivablePayment } from '../../domain/entities/receivablePayment.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type {
  ChangeReceivableParams,
  ReceivablePaymentResult,
  RecordReceivablePaymentInput,
} from '../types/receivable.types.js';

export class RecordReceivablePaymentUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ChangeReceivableParams, input: RecordReceivablePaymentInput): Promise<ReceivablePaymentResult> {
    const { requestId, amountInCents, method, receivedAt, notes } = input;
    const { version, receivableId, userId } = params;

    return this.processor.run(params, async (tx) => {
      const receivable = await this.processor.load(tx, receivableId);

      const now = new Date();

      const payment = ReceivablePayment.create(
        {
          id: randomUUID(),
          receivableId,
          requestId,
          amountInCents,
          method,
          receivedAt: new Date(receivedAt),
          notes,
          recordedById: userId,
        },
        now,
      );

      const previous = await tx.receivables.findPaymentByRequestId(receivableId, requestId);

      // A replay is checked before the version because the first
      // successful request already changed the receivable version.
      if (previous !== null) {
        const existing = ReceivablePayment.restore(previous);

        if (!existing.matchesRequest(payment)) {
          throw new ReceivableError('IDEMPOTENCY_CONFLICT');
        }

        return {
          receivable: receivable.view(now),
          payment: existing.snapshot(),
        };
      }

      receivable.assertVersion(version);
      receivable.receive(payment);

      const view = await this.processor.save(tx, receivable, params, now);

      await tx.receivables.createPayment(payment);

      return {
        receivable: view,
        payment: payment.snapshot(),
      };
    });
  }
}
