import { randomUUID } from 'node:crypto';

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { stripeConfig } from '../../../../config/stripe.config.js';
import { BillingWebhookRepository } from '../../application/ports/billingWebhookRepository.port.js';
import { ReconcilePlanChangeUseCase } from '../../application/useCases/reconcilePlanChange.useCase.js';
import { SyncBillingUseCase } from '../../application/useCases/syncBilling.useCase.js';
import { SyncPaymentMethodUpdateUseCase } from '../../application/useCases/syncPaymentMethodUpdate.useCase.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import { BillingRepository } from '../../domain/repositories/billing.repository.js';
import { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import { ClaimedWebhookJob, WebhookOutcome } from '../../domain/types/billing.types.js';

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
    private readonly webhookRepository: BillingWebhookRepository,
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
        .catch((error: unknown) => {
          if (error instanceof Error) {
            this.logger.error(`Billing polling failed: ${error.message}`, error.stack);

            return;
          }

          this.logger.error('Billing polling failed with an unknown error');
        })
        .finally(() => {
          this.running = undefined;
        });
    }, 2000);

    this.timer.unref();

    this.logger.log('Billing worker started. Polling every 2 seconds; reconciliation scheduled hourly per customer.');
  }

  private async process(): Promise<void> {
    for (let processed = 0; processed < 20; processed++) {
      if (this.stopping) {
        return;
      }

      const event = await this.webhookRepository.claimEvent(randomUUID());

      if (event === null) {
        break;
      }

      await this.processEvent(event);
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
          reconcile: true,
        });
      } catch (error: unknown) {
        if (!(error instanceof BillingError && error.code === 'BILLING_BUSY')) {
          this.logReconciliationFailure(customer.organizationId, error);
        }

        await this.billingRepository.postponeReconciliation(customer.organizationId);
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

  private async processEvent(event: ClaimedWebhookJob): Promise<void> {
    let leaseLost = false;
    let renewal: Promise<void> | undefined;
    let outcome: WebhookOutcome = 'COMPLETE';
    let code: string | undefined;

    const assertLease = (): void => {
      if (leaseLost) {
        throw new Error('Webhook lease lost');
      }
    };

    const heartbeat = setInterval(() => {
      if (renewal !== undefined || leaseLost) {
        return;
      }

      renewal = this.webhookRepository
        .renewEventLease(event)
        .then((owned) => {
          if (!owned) {
            leaseLost = true;
          }
        })
        .catch(() => {
          leaseLost = true;
        })
        .finally(() => {
          renewal = undefined;
        });
    }, 20000);

    heartbeat.unref();

    try {
      const customer = await this.billingRepository.customerByStripeId(event.stripeCustomerId);

      assertLease();

      if (customer === null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      await this.syncBillingUseCase.execute({
        organizationId: customer.organizationId,
        invoiceId: event.type.startsWith('invoice.') ? event.stripeObjectId : undefined,
      });

      assertLease();

      await this.reconcilePlanChangeUseCase.execute(customer.organizationId);

      assertLease();

      if (event.type.startsWith('setup_intent.')) {
        await this.syncPaymentMethodUpdateUseCase.execute({
          organizationId: customer.organizationId,
          setupIntentId: event.stripeObjectId,
        });

        assertLease();
      }
    } catch (error: unknown) {
      if (!leaseLost) {
        if (error instanceof BillingError && error.code === 'BILLING_BUSY') {
          outcome = 'DEFER';
        } else {
          outcome = 'RETRY';
          code = error instanceof BillingError ? error.code : 'WEBHOOK_PROCESSING_FAILED';
        }
      }
    } finally {
      clearInterval(heartbeat);

      await renewal;
    }

    if (leaseLost) {
      this.logger.warn({
        message: 'Webhook lease lost; completion was not acknowledged',
        eventId: event.id,
      });

      return;
    }

    const settled = await this.webhookRepository.settleEvent(event, outcome, code);

    if (!settled) {
      this.logger.warn({
        message: 'Webhook lease expired or changed before completion',
        eventId: event.id,
      });

      return;
    }

    if (outcome === 'RETRY') {
      this.logger.warn({
        message:
          event.attempts + 1 >= 25 ? 'Billing webhook requires manual recovery' : 'Billing webhook will be retried',
        eventId: event.id,
        code,
      });
    }
  }

  private logReconciliationFailure(organizationId: string, error: unknown): void {
    const cause = error instanceof BillingError ? (error.cause ?? error) : error;

    const rawCode = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;

    const causeCode =
      typeof rawCode === 'string' &&
      /^(P[0-9]{4}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|api_connection_error|api_error|rate_limit|resource_missing)$/.test(
        rawCode,
      )
        ? rawCode
        : undefined;

    const rawStatus =
      typeof cause === 'object' && cause !== null && 'statusCode' in cause ? cause.statusCode : undefined;

    const upstreamStatus =
      typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
        ? rawStatus
        : undefined;

    this.logger.error({
      message: 'Scheduled billing reconciliation failed',
      organizationId,
      code: error instanceof BillingError ? error.code : 'BILLING_RECONCILIATION_FAILED',
      causeCode,
      upstreamStatus,
    });
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
