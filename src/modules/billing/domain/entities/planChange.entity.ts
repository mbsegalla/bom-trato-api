import type { BillingInterval } from '../../../../generated/prisma/enums.js';
import { PlanChangeMode, PlanChangeStatus } from '../../../../generated/prisma/enums.js';
import { BillingError } from '../errors/billing.error.js';

export interface PlanChangeProps {
  id: string;
  organizationId: string;
  requestedById: string;
  sourcePlanPriceId: string;
  targetPlanPriceId: string;
  targetMaxUsers: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeItemId: string;
  sourceStripePriceId: string;
  targetStripePriceId: string;
  mode: PlanChangeMode;
  status: PlanChangeStatus;
  currency: string;
  amountDueNow: number;
  targetAmountInCents: number;
  targetInterval: BillingInterval;
  targetIntervalCount: number;
  periodStart: number;
  periodEnd: number;
  prorationDate: number;
  expiresAt: Date;
  startedAt: Date | null;
  stripeInvoiceId: string | null;
  stripeScheduleId: string | null;
}

export type CreatePlanChangeParams = Omit<
  PlanChangeProps,
  'status' | 'startedAt' | 'stripeInvoiceId' | 'stripeScheduleId'
>;

export interface PlanChangePrice {
  level: number;
  amountInCents: number;
  currency: string;
  interval: BillingInterval;
  intervalCount: number;
}

export interface DeterminePlanChangeModeParams {
  source: PlanChangePrice;
  target: PlanChangePrice;
}

export interface PlanChangeReferences {
  stripeInvoiceId: string | null;
  stripeScheduleId: string | null;
}

export class PlanChange {
  private constructor(private readonly state: PlanChangeProps) {}

  static create(params: CreatePlanChangeParams): PlanChange {
    if (params.sourcePlanPriceId === params.targetPlanPriceId) {
      throw new BillingError('PLAN_CHANGE_SAME_PRICE');
    }

    if (
      !Number.isInteger(params.targetMaxUsers) ||
      params.targetMaxUsers < 1 ||
      !Number.isInteger(params.amountDueNow) ||
      params.amountDueNow < 0 ||
      !Number.isInteger(params.targetAmountInCents) ||
      params.targetAmountInCents < 0 ||
      !Number.isInteger(params.targetIntervalCount) ||
      params.targetIntervalCount < 1
    ) {
      throw new BillingError('PLAN_CHANGE_UNSUPPORTED');
    }

    if (
      !Number.isFinite(params.expiresAt.getTime()) ||
      params.periodStart > params.prorationDate ||
      params.prorationDate >= params.periodEnd ||
      params.expiresAt.getTime() <= params.prorationDate * 1000 ||
      params.expiresAt.getTime() >= params.periodEnd * 1000
    ) {
      throw new BillingError('PLAN_CHANGE_QUOTE_EXPIRED');
    }

    return new PlanChange(
      structuredClone({
        ...params,
        status: PlanChangeStatus.QUOTED,
        startedAt: null,
        stripeInvoiceId: null,
        stripeScheduleId: null,
      }),
    );
  }

  static restore(state: PlanChangeProps): PlanChange {
    return new PlanChange(structuredClone(state));
  }

  static determineMode({ source, target }: DeterminePlanChangeModeParams): PlanChangeMode {
    if (source.level <= 0 || target.level <= 0 || source.currency !== target.currency) {
      throw new BillingError('PLAN_CHANGE_UNSUPPORTED');
    }

    const upgrade =
      source.interval === target.interval &&
      source.intervalCount === target.intervalCount &&
      target.level > source.level &&
      target.amountInCents > source.amountInCents;

    return upgrade ? PlanChangeMode.IMMEDIATE : PlanChangeMode.PERIOD_END;
  }

  isQuoted(): boolean {
    return this.state.status === PlanChangeStatus.QUOTED;
  }

  isProcessing(): boolean {
    return this.state.status === PlanChangeStatus.PROCESSING;
  }

  isTerminal(): boolean {
    return [PlanChangeStatus.APPLIED, PlanChangeStatus.CANCELED, PlanChangeStatus.EXPIRED].some(
      (status) => status === this.state.status,
    );
  }

  blocksAnotherChange(): boolean {
    return !this.isQuoted() && !this.isTerminal();
  }

  isQuoteExpired(now: Date): boolean {
    return this.isQuoted() && this.state.expiresAt <= now;
  }

  assertBelongsTo(organizationId: string): void {
    if (this.state.organizationId !== organizationId) {
      throw new BillingError('PLAN_CHANGE_NOT_FOUND');
    }
  }

  assertFitsMemberLimit(memberCount: number): void {
    if (memberCount > this.state.targetMaxUsers) {
      throw new BillingError('PLAN_MEMBER_LIMIT');
    }
  }

  confirm(now: Date): void {
    if (!this.isQuoted()) {
      throw new BillingError('PLAN_CHANGE_CONFLICT');
    }

    if (this.isQuoteExpired(now)) {
      throw new BillingError('PLAN_CHANGE_QUOTE_EXPIRED');
    }

    this.state.status = PlanChangeStatus.PROCESSING;
    this.state.startedAt = new Date(now);
  }

  markPaymentPending(): void {
    if (this.state.mode !== PlanChangeMode.IMMEDIATE) {
      throw new BillingError('PLAN_CHANGE_CONFLICT');
    }

    this.transition(PlanChangeStatus.PENDING_PAYMENT, [PlanChangeStatus.PROCESSING]);
  }

  markScheduled(): void {
    if (this.state.mode !== PlanChangeMode.PERIOD_END) {
      throw new BillingError('PLAN_CHANGE_CONFLICT');
    }

    this.transition(PlanChangeStatus.SCHEDULED, [PlanChangeStatus.PROCESSING]);
  }

  markApplied(): void {
    this.transition(PlanChangeStatus.APPLIED, [
      PlanChangeStatus.PROCESSING,
      PlanChangeStatus.PENDING_PAYMENT,
      PlanChangeStatus.SCHEDULED,
    ]);
  }

  markCanceled(): void {
    this.transition(PlanChangeStatus.CANCELED, [
      PlanChangeStatus.QUOTED,
      PlanChangeStatus.PROCESSING,
      PlanChangeStatus.PENDING_PAYMENT,
      PlanChangeStatus.SCHEDULED,
    ]);
  }

  markExpired(): void {
    this.transition(PlanChangeStatus.EXPIRED, [
      PlanChangeStatus.QUOTED,
      PlanChangeStatus.PROCESSING,
      PlanChangeStatus.PENDING_PAYMENT,
    ]);
  }

  assertCanRequestCancellation(now: Date): void {
    if (
      this.isTerminal() ||
      this.isProcessing() ||
      (this.state.status === PlanChangeStatus.SCHEDULED && now.getTime() >= this.state.periodEnd * 1000)
    ) {
      throw new BillingError('PLAN_CHANGE_CONFLICT');
    }
  }

  recordReferences({ stripeInvoiceId, stripeScheduleId }: PlanChangeReferences): void {
    if (stripeInvoiceId !== null) {
      this.state.stripeInvoiceId = stripeInvoiceId;
    }

    if (stripeScheduleId !== null) {
      this.state.stripeScheduleId = stripeScheduleId;
    }
  }

  toPublic(clientSecret: string | null = null) {
    return {
      id: this.state.id,
      sourcePlanPriceId: this.state.sourcePlanPriceId,
      targetPlanPriceId: this.state.targetPlanPriceId,
      mode: this.state.mode,
      status: this.state.status,
      currency: this.state.currency,
      amountDueNow: this.state.amountDueNow,
      targetAmountInCents: this.state.targetAmountInCents,
      targetInterval: this.state.targetInterval,
      targetIntervalCount: this.state.targetIntervalCount,
      effectiveAt: this.state.mode === PlanChangeMode.PERIOD_END ? new Date(this.state.periodEnd * 1000) : null,
      quoteExpiresAt: new Date(this.state.expiresAt),
      clientSecret,
    };
  }

  snapshot(): PlanChangeProps {
    return structuredClone(this.state);
  }

  private transition(next: PlanChangeStatus, allowed: readonly PlanChangeStatus[]): void {
    if (this.state.status === next) {
      return;
    }

    if (!allowed.includes(this.state.status)) {
      throw new BillingError('PLAN_CHANGE_CONFLICT');
    }

    this.state.status = next;
  }
}
