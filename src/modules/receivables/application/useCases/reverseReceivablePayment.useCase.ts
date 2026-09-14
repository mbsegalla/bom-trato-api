import { ReceivablePayment } from '../../domain/entities/receivablePayment.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import type { ChangeReceivableParams, ReceivablePaymentResult } from '../types/receivable.types.js';

export class ReverseReceivablePaymentUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ChangeReceivableParams, paymentId: string, reason: string): Promise<ReceivablePaymentResult> {
    const { version, receivableId, userId } = params;

    return this.processor.run(params, async (tx) => {
      const receivable = await this.processor.load(tx, receivableId);

      receivable.assertVersion(version);

      const state = await tx.receivables.findPaymentById(receivableId, paymentId);

      if (state === null) {
        throw new ReceivableError('PAYMENT_NOT_FOUND');
      }

      const payment = ReceivablePayment.restore(state);
      const now = new Date();

      receivable.reversePayment(payment, userId, reason, now);

      const view = await this.processor.save(tx, receivable, params, now);

      await tx.receivables.savePaymentReversal(payment);

      return {
        receivable: view,
        payment: payment.snapshot(),
      };
    });
  }
}
