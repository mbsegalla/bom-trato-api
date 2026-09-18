import { randomUUID } from 'node:crypto';

import { PaymentMethodUpdate } from '../../domain/entities/paymentMethodUpdate.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PaymentMethodUpdateProcessor } from '../services/paymentMethodUpdateProcessor.service.js';
import type { PaymentMethodOwnerParams, PaymentMethodUpdateResult } from '../types/billing.types.js';

const consentVersion = 'subscription-card-v1';
const lifetimeMs = 2 * 60 * 60 * 1000;

export class StartPaymentMethodUpdateUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
    private readonly processor: PaymentMethodUpdateProcessor,
  ) {}

  async execute(params: PaymentMethodOwnerParams): Promise<PaymentMethodUpdateResult> {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      await this.billingRepository.assertOwner(organizationId, userId);

      const active = await this.paymentMethodUpdateRepository.active(organizationId);

      if (active !== null) {
        if (!PaymentMethodUpdate.restore(active).wasRequestedBy(userId)) {
          const previous = PaymentMethodUpdate.restore(active);

          previous.markCanceled();

          await this.paymentMethodUpdateRepository.save(previous);
        } else {
          return this.processor.process(active);
        }
      }

      const customer = await this.billingRepository.customer(organizationId);

      if (customer.stripeCustomerId === null) {
        throw new BillingError('SUBSCRIPTION_NOT_FOUND');
      }

      await this.billingRepository.saveSnapshot({
        organizationId,
        snapshot: await this.billingGateway.snapshot(customer.stripeCustomerId),
      });

      const subscription = await this.billingRepository.currentSubscription(organizationId);

      if (subscription === null) {
        throw new BillingError('SUBSCRIPTION_NOT_FOUND');
      }

      PaymentMethodUpdate.assertSubscriptionCanUpdate(subscription.status);

      const now = new Date();

      const entity = PaymentMethodUpdate.create({
        id: randomUUID(),
        organizationId,
        requestedById: userId,
        stripeCustomerId: customer.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        consentVersion,
        consentAcceptedAt: now,
        expiresAt: new Date(now.getTime() + lifetimeMs),
      });

      return this.processor.process(await this.paymentMethodUpdateRepository.create(entity));
    });
  }
}
