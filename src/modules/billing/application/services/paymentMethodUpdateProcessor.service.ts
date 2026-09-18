import type { PaymentMethodUpdateProps } from '../../domain/entities/paymentMethodUpdate.entity.js';
import { PaymentMethodUpdate } from '../../domain/entities/paymentMethodUpdate.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { PaymentMethodGateway, PaymentSetup } from '../ports/paymentMethodGateway.port.js';
import type { PaymentMethodUpdateResult } from '../types/billing.types.js';

export class PaymentMethodUpdateProcessor {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
    private readonly paymentMethodGateway: PaymentMethodGateway,
  ) {}

  result(update: PaymentMethodUpdateProps, clientSecret: string | null = null): PaymentMethodUpdateResult {
    return PaymentMethodUpdate.restore(update).toPublic(clientSecret);
  }

  async setup(update: PaymentMethodUpdateProps): Promise<PaymentSetup> {
    let setup: PaymentSetup;

    if (update.stripeSetupIntentId !== null) {
      setup = await this.paymentMethodGateway.retrieveSetup(update.stripeSetupIntentId);
    } else {
      // Do not recreate an uncertain request after Stripe's
      // idempotency retention window may have elapsed.
      const age = Date.now() - update.createdAt.getTime();

      if (age >= 23 * 60 * 60 * 1000) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      setup = await this.paymentMethodGateway.createSetup(update);

      const entity = PaymentMethodUpdate.restore(update);

      entity.attachSetup(setup);

      await this.paymentMethodUpdateRepository.save(entity);
    }

    PaymentMethodUpdate.restore(update).attachSetup(setup);

    return setup;
  }

  async process(update: PaymentMethodUpdateProps): Promise<PaymentMethodUpdateResult> {
    const entity = PaymentMethodUpdate.restore(update);

    if (!entity.isPending()) {
      return this.result(update);
    }

    try {
      await this.billingRepository.assertOwner(update.organizationId, update.requestedById);
    } catch (error: unknown) {
      if (
        error instanceof BillingError &&
        (error.code === 'OWNER_REQUIRED' ||
          error.code === 'EMAIL_NOT_VERIFIED' ||
          error.code === 'ORGANIZATION_NOT_FOUND')
      ) {
        entity.markCanceled();

        return this.result(await this.paymentMethodUpdateRepository.save(entity));
      }

      throw error;
    }

    const customer = await this.billingRepository.customer(update.organizationId);

    entity.assertCustomer(customer.stripeCustomerId);

    let setup = await this.setup(update);

    entity.attachSetup(setup);

    if (entity.shouldCancelSetup(setup.status, new Date())) {
      setup = await this.paymentMethodGateway.cancelSetup(setup.id);
    }

    if (setup.status === 'canceled') {
      entity.markCanceled();

      return this.result(await this.paymentMethodUpdateRepository.save(entity));
    }

    if (setup.status !== 'succeeded') {
      await this.paymentMethodUpdateRepository.postpone(update.id, 30);

      const canConfirm = entity.canConfirmSetup(setup.status, new Date());

      return this.result(update, canConfirm ? setup.clientSecret : null);
    }

    if (setup.paymentMethodId === null) {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }

    await this.paymentMethodGateway.apply({
      customerId: update.stripeCustomerId,
      subscriptionId: update.stripeSubscriptionId,
      updateId: update.id,
      paymentMethodId: setup.paymentMethodId,
    });

    entity.markApplied();

    return this.result(await this.paymentMethodUpdateRepository.save(entity));
  }
}
