import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { stripeConfig } from '../../../../config/stripe.config.js';
import { ReconcilePlanChangeUseCase } from '../../application/useCases/reconcilePlanChange.useCase.js';
import { SyncBillingUseCase } from '../../application/useCases/syncBilling.useCase.js';
import { SyncPaymentMethodUpdateUseCase } from '../../application/useCases/syncPaymentMethodUpdate.useCase.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import { BillingRepository } from '../../domain/repositories/billing.repository.js';
import { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';

@Injectable()
export class BillingWebhookWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingWebhookWorker.name);

  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(stripeConfig.KEY)
    private readonly configuration: ConfigType<typeof stripeConfig>,

    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly reconcilePlanChangeUseCase: ReconcilePlanChangeUseCase,
    private readonly syncBillingUseCase: SyncBillingUseCase,
    private readonly syncPaymentMethodUpdateUseCase: SyncPaymentMethodUpdateUseCase,
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
  ) {}

  onModuleInit(): void {
    if (!this.configuration.workerEnabled) {
      return;
    }

    this.timer = setInterval(() => {
      if (this.running !== undefined || this.stopping) {
        return;
      }

      this.running = this.process()
        .catch(() => {
          this.logger.error('Billing polling failed');
        })
        .finally(() => {
          this.running = undefined;
        });
    }, 2000);

    this.timer.unref();

    this.logger.log('Billing worker started. Polling every 2 seconds; reconciliation scheduled hourly per customer.');
  }

  private async process(): Promise<void> {
    for (const event of await this.billingRepository.pendingEvents()) {
      if (this.stopping) {
        return;
      }

      try {
        if (await this.billingRepository.isProcessed(event.id)) {
          continue;
        }

        const customer = await this.billingRepository.customerByStripeId(event.stripeCustomerId);

        if (customer === null) {
          throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
        }

        // Persist billing before processing related operations.
        // The event remains pending until all required steps succeed.
        await this.syncBillingUseCase.execute({
          organizationId: customer.organizationId,
          invoiceId: event.type.startsWith('invoice.') ? event.stripeObjectId : undefined,
        });

        await this.reconcilePlanChangeUseCase.execute(customer.organizationId);

        if (event.type.startsWith('setup_intent.')) {
          await this.syncPaymentMethodUpdateUseCase.execute({
            organizationId: customer.organizationId,
            setupIntentId: event.stripeObjectId,
          });
        }

        await this.billingRepository.completeEvent(event.id);
      } catch (error: unknown) {
        if (error instanceof BillingError && error.code === 'BILLING_BUSY') {
          await this.billingRepository.deferEvent(event.id);
          continue;
        }

        const code = error instanceof BillingError ? error.code : 'WEBHOOK_PROCESSING_FAILED';

        await this.billingRepository.retryEvent(event.id, event.attempts, code);

        this.logger.warn({
          message:
            event.attempts + 1 >= 25 ? 'Billing webhook requires manual recovery' : 'Billing webhook will be retried',
          eventId: event.id,
          code,
        });
      }
    }

    await this.processPlanChanges();
    await this.processPaymentMethodUpdates();

    for (const customer of await this.billingRepository.dueCustomers()) {
      if (this.stopping) {
        return;
      }

      try {
        await this.syncBillingUseCase.execute({
          organizationId: customer.organizationId,
          includeInvoiceHistory: true,
        });
      } catch (error: unknown) {
        await this.billingRepository.postponeReconciliation(customer.organizationId);

        if (!(error instanceof BillingError && error.code === 'BILLING_BUSY')) {
          this.logger.error({
            message: 'Scheduled billing reconciliation failed',
            organizationId: customer.organizationId,
          });
        }
      }
    }
  }

  private async processPlanChanges(): Promise<void> {
    for (const change of await this.planChangeRepository.due()) {
      if (this.stopping) {
        return;
      }

      try {
        await this.reconcilePlanChangeUseCase.execute(change.organizationId);
      } catch (error: unknown) {
        await this.planChangeRepository.postpone(change.id, 60);

        if (error instanceof BillingError && error.code === 'BILLING_BUSY') {
          continue;
        }

        this.logger.error({
          message: 'Plan change reconciliation failed',
          changeId: change.id,
          organizationId: change.organizationId,
          code: error instanceof BillingError ? error.code : 'PLAN_CHANGE_RECONCILIATION_FAILED',
        });
      }
    }
  }

  private async processPaymentMethodUpdates(): Promise<void> {
    const updates = await this.paymentMethodUpdateRepository.due();

    for (const update of updates) {
      if (this.stopping) {
        return;
      }

      try {
        await this.syncPaymentMethodUpdateUseCase.execute({
          organizationId: update.organizationId,
          updateId: update.id,
        });
      } catch (error: unknown) {
        await this.paymentMethodUpdateRepository.postpone(update.id, 60);

        if (error instanceof BillingError && error.code === 'BILLING_BUSY') {
          continue;
        }

        this.logger.error({
          message: 'Payment method update reconciliation failed',
          updateId: update.id,
          organizationId: update.organizationId,
          code: error instanceof BillingError ? error.code : 'PAYMENT_METHOD_UPDATE_FAILED',
        });
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }

    await this.running;

    if (this.configuration.workerEnabled) {
      this.logger.log('Billing worker stopped.');
    }
  }
}
