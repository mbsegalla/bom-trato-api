import { randomUUID } from 'node:crypto';

import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval, SchedulerRegistry } from '@nestjs/schedule';

import { stripeConfig } from '../../../../config/stripe.config.js';
import { BillingWebhookRepository } from '../../application/ports/billingWebhookRepository.port.js';
import { HandleDeletedBillingCustomerUseCase } from '../../application/useCases/handleDeletedBillingCustomer.useCase.js';
import { QueueBillingAlertUseCase } from '../../application/useCases/queueBillingAlert.useCase.js';
import { QueueNextBillingConfirmationUseCase } from '../../application/useCases/queueNextBillingConfirmation.useCase.js';
import { ReconcilePlanChangeUseCase } from '../../application/useCases/reconcilePlanChange.useCase.js';
import { SyncBillingUseCase } from '../../application/useCases/syncBilling.useCase.js';
import { SyncPaymentMethodUpdateUseCase } from '../../application/useCases/syncPaymentMethodUpdate.useCase.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import { BillingRepository } from '../../domain/repositories/billing.repository.js';
import { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import { ClaimedWebhookJob, WebhookOutcome } from '../../domain/types/billing.types.js';
import { BILLING_SCHEDULE_CHANGED_EVENT, BILLING_WORK_AVAILABLE_EVENT, BillingWork } from '../events/billing.events.js';
import { safeBillingError } from '../logging/safeBillingError.js';
import { PrismaBillingScheduleRepository } from '../repositories/prismaBillingSchedule.repository.js';

@Injectable()
export class BillingWebhookWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BillingWebhookWorker.name);

  private readonly pending = new Set<BillingWork>();
  private readonly scheduleChanges = new Set<BillingWork>();

  private running?: Promise<void>;
  private started = false;
  private stopping = false;

  constructor(
    @Inject(stripeConfig.KEY)
    private readonly configuration: ConfigType<typeof stripeConfig>,

    private readonly reconcilePlanChangeUseCase: ReconcilePlanChangeUseCase,
    private readonly syncBillingUseCase: SyncBillingUseCase,
    private readonly syncPaymentMethodUpdateUseCase: SyncPaymentMethodUpdateUseCase,
    private readonly queueBillingAlertUseCase: QueueBillingAlertUseCase,
    private readonly queueNextBillingConfirmationUseCase: QueueNextBillingConfirmationUseCase,
    private readonly handleDeletedBillingCustomerUseCase: HandleDeletedBillingCustomerUseCase,
    private readonly billingRepository: BillingRepository,
    private readonly webhookRepository: BillingWebhookRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly paymentMethodUpdateRepository: PaymentMethodUpdateRepository,
    private readonly scheduleRepository: PrismaBillingScheduleRepository,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configuration.workerEnabled) {
      return;
    }

    this.started = true;

    this.logger.log('Billing worker started; event-driven processing with scheduled retries and 60-second recovery');

    this.recover();
  }

  @OnEvent(BILLING_WORK_AVAILABLE_EVENT, { suppressErrors: true })
  handleWorkAvailable(work: BillingWork): void {
    try {
      this.request(work);
    } catch (error: unknown) {
      this.logDispatchFailure(error);
    }
  }

  @OnEvent(BILLING_SCHEDULE_CHANGED_EVENT, { suppressErrors: true })
  handleScheduleChanged(work: BillingWork): void {
    try {
      if (!this.accepts(work)) {
        return;
      }

      this.clearTimer(work);
      this.scheduleChanges.add(work);
      this.start();
    } catch (error: unknown) {
      this.logDispatchFailure(error);
    }
  }

  private logDispatchFailure(error: unknown): void {
    this.logger.error({
      message: 'Billing task dispatch failed; recovery remains available',
      ...safeBillingError(error),
    });
  }

  private accepts(work: BillingWork): boolean {
    return (
      this.started && !this.stopping && this.configuration.workerEnabled && Object.values(BillingWork).includes(work)
    );
  }

  @Interval('billing-recovery', 60_000)
  recover(): void {
    for (const work of Object.values(BillingWork)) {
      this.handleWorkAvailable(work);
    }
  }

  private request(work: BillingWork): void {
    if (!this.accepts(work)) {
      return;
    }

    this.clearTimer(work);
    this.pending.add(work);
    this.start();
  }

  private start(): void {
    if (this.running !== undefined || this.stopping || (this.pending.size === 0 && this.scheduleChanges.size === 0)) {
      return;
    }

    // Coalesce synchronous events before starting database work.
    this.running = Promise.resolve()
      .then(() => this.drain())
      .catch((error: unknown) => {
        this.logger.error({
          message: 'Billing worker failed; persisted work remains available for recovery',
          ...safeBillingError(error),
        });
      })
      .finally(() => {
        this.running = undefined;
        this.start();
      });
  }

  private async drain(): Promise<void> {
    while (!this.stopping) {
      const work = this.pending.values().next().value ?? this.scheduleChanges.values().next().value;

      if (work === undefined) {
        return;
      }

      const shouldProcess = this.pending.delete(work);

      this.scheduleChanges.delete(work);

      try {
        const more = shouldProcess ? await this.runBatch(work) : false;

        if (this.stopping || this.pending.has(work)) {
          continue;
        }

        if (more) {
          this.scheduleChanges.delete(work);
          this.schedule(work, 25);
          continue;
        }

        // Changes emitted while processing are covered by this fresh read.
        this.scheduleChanges.delete(work);

        const nextRunAt = await this.scheduleRepository.nextRunAt(work);

        // A change during the read invalidates its result.
        // Read again without processing another batch.
        if (this.stopping || this.pending.has(work) || this.scheduleChanges.has(work)) {
          continue;
        }

        if (nextRunAt !== null) {
          const delay = nextRunAt.getTime() - Date.now();
          const fallbackDelay = shouldProcess ? 60_000 : 25;

          this.schedule(work, delay > 0 ? delay : fallbackDelay);
        }
      } catch (error: unknown) {
        this.logger.error({
          message: 'Billing task failed; retry scheduled',
          work,
          ...safeBillingError(error),
        });

        this.pending.delete(work);
        this.scheduleChanges.delete(work);
        this.schedule(work, 60_000);
      }
    }
  }

  private runBatch(work: BillingWork): Promise<boolean> {
    switch (work) {
      case BillingWork.WEBHOOKS:
        return this.processWebhooks();

      case BillingWork.PLAN_CHANGES:
        return this.processPlanChanges();

      case BillingWork.PAYMENT_METHOD_UPDATES:
        return this.processPaymentMethodUpdates();

      case BillingWork.CONFIRMATIONS:
        return this.processSuccessNotifications();

      case BillingWork.RECONCILIATION:
        return this.processReconciliation();
    }
  }

  private schedule(work: BillingWork, delay: number): void {
    if (this.stopping) {
      return;
    }

    this.clearTimer(work);

    const timeout = setTimeout(
      () => {
        this.handleWorkAvailable(work);
      },
      Math.min(2_147_483_647, Math.max(25, Math.ceil(delay))),
    );

    timeout.unref();

    this.scheduler.addTimeout(this.timerName(work), timeout);
  }

  private timerName(work: BillingWork): string {
    return `billing-${work}-next-run`;
  }

  private clearTimer(work: BillingWork): void {
    const name = this.timerName(work);

    if (this.scheduler.doesExist('timeout', name)) {
      this.scheduler.deleteTimeout(name);
    }
  }

  private async processWebhooks(): Promise<boolean> {
    for (let processed = 0; processed < 20; processed++) {
      if (this.stopping) {
        return false;
      }

      const event = await this.webhookRepository.claimEvent(randomUUID());

      if (event === null) {
        return false;
      }

      try {
        await this.processEvent(event);
      } catch (error: unknown) {
        this.logger.error({
          message: 'Billing webhook processing could not complete',
          webhookEventId: event.id,
          ...safeBillingError(error),
        });

        throw error;
      }
    }

    return true;
  }

  private async processPlanChanges(): Promise<boolean> {
    const changes = await this.planChangeRepository.due();

    for (const change of changes) {
      if (this.stopping) {
        return false;
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
          planChangeId: change.id,
          organizationId: change.organizationId,
          ...safeBillingError(error),
        });
      }
    }

    return changes.length === 5;
  }

  private async processPaymentMethodUpdates(): Promise<boolean> {
    const updates = await this.paymentMethodUpdateRepository.due();

    for (const update of updates) {
      if (this.stopping) {
        return false;
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
          paymentMethodUpdateId: update.id,
          organizationId: update.organizationId,
          ...safeBillingError(error),
        });
      }
    }

    return updates.length === 5;
  }

  private async processSuccessNotifications(): Promise<boolean> {
    for (let processed = 0; processed < 20; processed++) {
      if (this.stopping) {
        return false;
      }

      if (!(await this.queueNextBillingConfirmationUseCase.execute())) {
        return false;
      }
    }

    return true;
  }

  private async processReconciliation(): Promise<boolean> {
    const customers = await this.billingRepository.dueCustomers();

    for (const customer of customers) {
      if (this.stopping) {
        return false;
      }

      try {
        await this.syncBillingUseCase.execute({
          organizationId: customer.organizationId,
          reconcile: true,
        });
      } catch (error: unknown) {
        if (!(error instanceof BillingError && error.code === 'BILLING_BUSY')) {
          this.logReconciliationFailure(error, customer.organizationId);
        }

        await this.billingRepository.postponeReconciliation(customer.organizationId);
      }
    }

    // dueCustomers currently returns at most one customer.
    return customers.length > 0;
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
      if (event.type === 'customer.deleted') {
        await this.handleDeletedBillingCustomerUseCase.execute({
          stripeCustomerId: event.stripeCustomerId,
          deletedAt: event.receivedAt,
        });

        assertLease();
      } else {
        const customer = await this.billingRepository.customerByStripeId(event.stripeCustomerId);

        assertLease();

        if (customer === null) {
          throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
        }

        if (customer.stripeCustomerId !== event.stripeCustomerId) {
          this.logger.debug({
            message: 'Ignoring webhook for detached Stripe customer',
            webhookEventId: event.id,
            stripeCustomerId: event.stripeCustomerId,
            organizationId: customer.organizationId,
          });
        } else {
          await this.syncBillingUseCase.execute({
            organizationId: customer.organizationId,
            invoiceId: event.type.startsWith('invoice.') ? event.stripeObjectId : undefined,
          });

          assertLease();

          await this.queueBillingAlertUseCase.execute(customer.organizationId, event);

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
        }
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
        webhookEventId: event.id,
      });

      return;
    }

    const settled = await this.webhookRepository.settleEvent(event, outcome, code);

    if (!settled) {
      this.logger.warn({
        message: 'Webhook lease expired or changed before completion',
        webhookEventId: event.id,
      });

      return;
    }

    if (outcome === 'RETRY') {
      this.logger.warn({
        message:
          event.attempts + 1 >= 25 ? 'Billing webhook requires manual recovery' : 'Billing webhook will be retried',
        webhookEventId: event.id,
        attempt: event.attempts + 1,
        ...safeBillingError({ code }),
      });
    }
  }

  private logReconciliationFailure(error: unknown, organizationId: string): void {
    this.logger.error({
      message: 'Scheduled billing reconciliation failed',
      organizationId,
      ...safeBillingError(error),
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.pending.clear();
    this.scheduleChanges.clear();

    for (const work of Object.values(BillingWork)) {
      this.clearTimer(work);
    }

    await this.running;

    if (this.configuration.workerEnabled) {
      this.logger.log('Billing worker stopped.');
    }
  }
}
