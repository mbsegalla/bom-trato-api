import { PaymentMethodUpdate } from '../../domain/entities/paymentMethodUpdate.entity.js';
import type { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PaymentMethodUpdateProcessor } from '../services/paymentMethodUpdateProcessor.service.js';
import type { SynchronizePaymentMethodUpdateParams } from '../types/updatePaymentMethod.types.js';

export class SyncPaymentMethodUpdateUseCase {
  constructor(
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
    private readonly billingLock: BillingLock,
    private readonly processor: PaymentMethodUpdateProcessor,
  ) {}

  async execute({ organizationId, updateId, setupIntentId }: SynchronizePaymentMethodUpdateParams): Promise<void> {
    await this.billingLock.run(`organization:${organizationId}`, async () => {
      const update =
        updateId === undefined
          ? await this.paymentMethodUpdateRepository.active(organizationId)
          : await this.paymentMethodUpdateRepository.find(updateId);

      if (
        update === null ||
        update.organizationId !== organizationId ||
        !PaymentMethodUpdate.restore(update).isPending()
      ) {
        return;
      }

      if (setupIntentId !== undefined && update.stripeSetupIntentId !== setupIntentId) {
        return;
      }

      await this.processor.process(update);
    });
  }
}
