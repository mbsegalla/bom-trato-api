import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PaymentMethodUpdateProcessor } from '../services/paymentMethodUpdateProcessor.service.js';
import type { CompletePaymentMethodUpdateParams, PaymentMethodUpdateResult } from '../types/billing.types.js';

export class CompletePaymentMethodUpdateUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
    private readonly billingLock: BillingLock,
    private readonly processor: PaymentMethodUpdateProcessor,
  ) {}

  async execute(params: CompletePaymentMethodUpdateParams): Promise<PaymentMethodUpdateResult> {
    const { organizationId, updateId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      await this.billingRepository.assertOwner(organizationId, userId);

      const update = await this.paymentMethodUpdateRepository.find(updateId);

      if (update === null || update.organizationId !== organizationId) {
        throw new BillingError('PAYMENT_METHOD_UPDATE_NOT_FOUND');
      }

      const result = await this.processor.process(update);

      return {
        ...result,
        clientSecret: null,
      };
    });
  }
}
