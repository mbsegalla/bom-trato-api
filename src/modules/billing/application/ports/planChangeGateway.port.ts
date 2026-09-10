import type { PlanChangeProps, PlanChangeReferences } from '../../domain/entities/planChange.entity.js';

export interface PlanChangeSubscriptionParams {
  customerId: string;
  subscriptionId: string;
}

export interface RemotePlanChangeSource {
  stripeItemId: string;
  stripePriceId: string;
  periodStart: number;
  periodEnd: number;
}

export interface RemotePlanChangeState extends PlanChangeReferences {
  status: 'PENDING_PAYMENT' | 'SCHEDULED' | 'APPLIED' | 'CANCELED' | 'EXPIRED';
  clientSecret: string | null;
}

export abstract class PlanChangeGateway {
  abstract source(params: PlanChangeSubscriptionParams): Promise<RemotePlanChangeSource>;
  abstract preview(change: PlanChangeProps): Promise<number>;
  abstract execute(change: PlanChangeProps): Promise<RemotePlanChangeState>;
  abstract inspect(change: PlanChangeProps): Promise<RemotePlanChangeState | null>;
  abstract cancel(change: PlanChangeProps): Promise<void>;
  abstract releaseSchedule(change: PlanChangeProps): Promise<void>;
}
