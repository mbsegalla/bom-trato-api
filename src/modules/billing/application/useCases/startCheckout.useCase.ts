import { randomUUID } from 'node:crypto';

import { Subscription } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { StartCheckoutParams, StartCheckoutResult } from '../types/billing.types.js';

export class StartCheckoutUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
    private readonly frontendUrl: string,
  ) {}

  async execute(params: StartCheckoutParams): Promise<StartCheckoutResult> {
    const { organizationId, userId, planPriceId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    const price = await this.billingRepository.availablePrice(planPriceId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      let customer = await this.billingRepository.customer(organizationId);

      if (customer.stripeCustomerId === null) {
        await this.billingRepository.markCustomerCreation(customer.id, new Date());

        customer = await this.billingRepository.customer(organizationId);

        const requestedAt = customer.creationRequestedAt;

        let customerId = await this.billingGateway.findCustomer(customer);

        if (customerId === null) {
          if (requestedAt === null || Date.now() - requestedAt.getTime() > 23 * 60 * 60 * 1000) {
            throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
          }

          customerId = await this.billingGateway.createCustomer(customer);
        }

        await this.billingRepository.setCustomerId(customer.id, customerId);

        customer = {
          ...customer,
          stripeCustomerId: customerId,
        };
      }

      const customerId = customer.stripeCustomerId;

      if (customerId === null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      const snapshot = await this.billingGateway.snapshot(customerId);

      await this.billingRepository.saveSnapshot({
        organizationId,
        snapshot,
      });

      if (snapshot.subscriptions.some((subscription) => Subscription.blocksNewCheckout(subscription.status))) {
        throw new BillingError('SUBSCRIPTION_EXISTS');
      }

      let attempt = await this.billingRepository.pendingCheckout(organizationId);

      if (attempt !== null) {
        const session = attempt.stripeSessionId
          ? await this.billingGateway.checkout(attempt.stripeSessionId)
          : await this.billingGateway.findCheckout(customerId, attempt.id);

        if (session !== null) {
          await this.billingRepository.attachCheckout(attempt.id, session.stripeSessionId);

          if (session.status === 'COMPLETE') {
            await this.billingRepository.closeCheckout(attempt.id, 'COMPLETE');
            throw new BillingError('SUBSCRIPTION_EXISTS');
          }

          if (session.status === 'EXPIRED') {
            await this.billingRepository.closeCheckout(attempt.id, 'EXPIRED');
            attempt = null;
          } else {
            if (attempt.planPriceId !== planPriceId) {
              throw new BillingError('CHECKOUT_IN_PROGRESS');
            }

            if (session.clientSecret === null) {
              throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
            }

            return {
              attemptId: attempt.id,
              clientSecret: session.clientSecret,
            };
          }
        } else if (attempt.expiresAt <= new Date()) {
          await this.billingRepository.closeCheckout(attempt.id, 'EXPIRED');
          attempt = null;
        }
      }

      if (attempt !== null && attempt.planPriceId !== planPriceId) {
        throw new BillingError('CHECKOUT_IN_PROGRESS');
      }

      if (attempt === null) {
        await this.billingGateway.validatePrice(price);

        const returnUrl = new URL('/billing/return', this.frontendUrl);
        returnUrl.searchParams.set('organizationId', organizationId);

        attempt = await this.billingRepository.createCheckout({
          id: randomUUID(),
          organizationId,
          planPriceId,
          stripePriceId: price.stripePriceId,
          returnUrl: returnUrl.toString(),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });
      }

      if (attempt.expiresAt.getTime() - Date.now() < 30 * 60 * 1000) {
        throw new BillingError('CHECKOUT_EXPIRED');
      }

      const session = await this.billingGateway.createCheckout({
        customerId,
        attempt,
      });

      await this.billingRepository.attachCheckout(attempt.id, session.stripeSessionId);

      if (session.status !== 'OPEN' || session.clientSecret === null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      return {
        attemptId: attempt.id,
        clientSecret: session.clientSecret,
      };
    });
  }
}
