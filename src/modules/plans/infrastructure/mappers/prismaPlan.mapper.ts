import type { Plan as PrismaPlan, PlanPrice as PrismaPlanPrice } from '../../../../generated/prisma/client.js';
import { Plan } from '../../domain/entities/plan.entity.js';

type PlanRecord = Pick<PrismaPlan, 'id' | 'code' | 'name' | 'description' | 'maxUsers' | 'teamManagementEnabled'> & {
  planPrices: Pick<PrismaPlanPrice, 'id' | 'amountInCents' | 'currency' | 'interval' | 'intervalCount'>[];
};

export function toPlan(record: PlanRecord): Plan {
  return new Plan({
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    maxUsers: record.maxUsers,
    teamManagementEnabled: record.teamManagementEnabled,
    prices: record.planPrices.map((price) => ({
      id: price.id,
      amountInCents: price.amountInCents,
      currency: price.currency,
      interval: price.interval,
      intervalCount: price.intervalCount,
    })),
  });
}
