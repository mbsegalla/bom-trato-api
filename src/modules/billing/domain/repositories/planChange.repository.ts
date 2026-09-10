import type { PlanChange, PlanChangePrice, PlanChangeProps } from '../entities/planChange.entity.js';

export interface PlanPriceChangeInfo extends PlanChangePrice {
  id: string;
  planId: string;
  maxUsers: number;
}

export abstract class PlanChangeRepository {
  abstract priceInfo(planPriceId: string): Promise<PlanPriceChangeInfo>;
  abstract create(change: PlanChange): Promise<void>;
  abstract find(id: string): Promise<PlanChangeProps | null>;
  abstract active(organizationId: string): Promise<PlanChangeProps | null>;
  abstract reserve(id: string): Promise<PlanChangeProps>;
  abstract save(change: PlanChange): Promise<void>;
  abstract due(): Promise<PlanChangeProps[]>;
  abstract postpone(id: string, seconds: number): Promise<void>;
}
