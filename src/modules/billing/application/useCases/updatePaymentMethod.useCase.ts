import { randomUUID } from 'node:crypto';

import type { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type {
  PaymentMethodUpdateProps,
  PaymentMethodUpdateRepository,
} from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { CardSummary, PaymentMethodGateway, PaymentSetup } from '../ports/paymentMethodGateway.port.js';

export interface PaymentMethodOwnerParams {
  organizationId: string;
  userId: string;
}

export interface CompletePaymentMethodUpdateParams extends PaymentMethodOwnerParams {
  updateId: string;
}

export interface SynchronizePaymentMethodUpdateParams {
  organizationId: string;
  updateId?: string;
  setupIntentId?: string;
}

export interface PaymentMethodUpdateResult {
  updateId: string;
  status: PaymentMethodUpdateStatus;
  clientSecret: string | null;
}

const consentVersion = 'subscription-card-v1';
const lifetimeMs = 2 * 60 * 60 * 1000;

const supportedStatuses = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'PAUSED']);

export class UpdatePaymentMethodUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
    private readonly paymentMethodGateway: PaymentMethodGateway,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
  ) {}

  private result(update: PaymentMethodUpdateProps, clientSecret: string | null = null): PaymentMethodUpdateResult {
    return {
      updateId: update.id,
      status: update.status,
      clientSecret,
    };
  }

  private async setup(update: PaymentMethodUpdateProps): Promise<PaymentSetup> {
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

      await this.paymentMethodUpdateRepository.saveSetupIntent({
        id: update.id,
        stripeSetupIntentId: setup.id,
      });
    }

    if (setup.customerId !== update.stripeCustomerId || setup.updateId !== update.id) {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }

    return setup;
  }

  async start({ organizationId, userId }: PaymentMethodOwnerParams): Promise<PaymentMethodUpdateResult> {
    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      await this.billingRepository.assertOwner(organizationId, userId);

      const active = await this.paymentMethodUpdateRepository.active(organizationId);

      if (active !== null) {
        // An ownership change invalidates the previous authorization.
        if (active.requestedById !== userId) {
          await this.paymentMethodUpdateRepository.finish({
            id: active.id,
            status: 'CANCELED',
          });
        } else {
          return this.process(active);
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

      if (!supportedStatuses.has(subscription.status)) {
        throw new BillingError('INVALID_SUBSCRIPTION_STATE');
      }

      const now = new Date();

      const update = await this.paymentMethodUpdateRepository.create({
        id: randomUUID(),
        organizationId,
        requestedById: userId,
        stripeCustomerId: customer.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        consentVersion,
        consentAcceptedAt: now,
        expiresAt: new Date(now.getTime() + lifetimeMs),
      });

      return this.process(update);
    });
  }

  async complete({
    organizationId,
    userId,
    updateId,
  }: CompletePaymentMethodUpdateParams): Promise<PaymentMethodUpdateResult> {
    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      await this.billingRepository.assertOwner(organizationId, userId);

      const update = await this.paymentMethodUpdateRepository.find(updateId);

      if (update === null || update.organizationId !== organizationId) {
        throw new BillingError('PAYMENT_METHOD_UPDATE_NOT_FOUND');
      }

      const result = await this.process(update);

      // Completion does not need to expose the client secret.
      return { ...result, clientSecret: null };
    });
  }

  async current({ organizationId, userId }: PaymentMethodOwnerParams): Promise<CardSummary | null> {
    await this.billingRepository.assertOwner(organizationId, userId);

    const customer = await this.billingRepository.customer(organizationId);
    const subscription = await this.billingRepository.currentSubscription(organizationId);

    if (customer.stripeCustomerId === null || subscription === null) {
      return null;
    }

    return this.paymentMethodGateway.current({
      customerId: customer.stripeCustomerId,
      subscriptionId: subscription.stripeSubscriptionId,
    });
  }

  async synchronize({ organizationId, updateId, setupIntentId }: SynchronizePaymentMethodUpdateParams): Promise<void> {
    await this.billingLock.run(`organization:${organizationId}`, async () => {
      const update =
        updateId === undefined
          ? await this.paymentMethodUpdateRepository.active(organizationId)
          : await this.paymentMethodUpdateRepository.find(updateId);

      if (update === null || update.organizationId !== organizationId || update.status !== 'PENDING') {
        return;
      }

      // Ignore events from other SetupIntent flows or older attempts.
      // A missing local ID is recovered by the periodic worker.
      if (setupIntentId !== undefined && update.stripeSetupIntentId !== setupIntentId) {
        return;
      }

      await this.process(update);
    });
  }

  private async process(update: PaymentMethodUpdateProps): Promise<PaymentMethodUpdateResult> {
    if (update.status !== 'PENDING') {
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
        return this.result(
          await this.paymentMethodUpdateRepository.finish({
            id: update.id,
            status: 'CANCELED',
          }),
        );
      }

      throw error;
    }

    const customer = await this.billingRepository.customer(update.organizationId);

    if (customer.stripeCustomerId !== update.stripeCustomerId) {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }

    let setup = await this.setup(update);

    // Processing and successful confirmations must be resolved,
    // even if the user completed authentication near the deadline.
    if (
      Date.now() >= update.expiresAt.getTime() &&
      setup.status !== 'succeeded' &&
      setup.status !== 'processing' &&
      setup.status !== 'canceled'
    ) {
      setup = await this.paymentMethodGateway.cancelSetup(setup.id);
    }

    if (setup.status === 'canceled') {
      return this.result(
        await this.paymentMethodUpdateRepository.finish({
          id: update.id,
          status: 'CANCELED',
        }),
      );
    }

    if (setup.status !== 'succeeded') {
      await this.paymentMethodUpdateRepository.postpone(update.id, 30);

      const canConfirm = setup.status !== 'processing' && Date.now() < update.expiresAt.getTime();

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

    return this.result(
      await this.paymentMethodUpdateRepository.finish({
        id: update.id,
        status: 'APPLIED',
      }),
    );
  }
}
