import type { SubscriptionCancellationService } from '../services/subscriptionCancellationService.service.js';
import type { SetCancellationParams } from '../types/billing.types.js';

export class CancelSubscriptionUseCase {
  constructor(private readonly processor: SubscriptionCancellationService) {}

  execute(params: Omit<SetCancellationParams, 'cancelAtPeriodEnd'>): Promise<void> {
    return this.processor.apply({
      ...params,
      cancelAtPeriodEnd: true,
    });
  }
}
