import type { Plan } from '../../domain/entities/plan.entity.js';
import type { PlanResponseDto } from '../../presentation/http/dtos/responses/planResponse.dto.js';

export function toPlanResponse(plan: Plan): PlanResponseDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    maxUsers: plan.maxUsers,
    teamManagementEnabled: plan.teamManagementEnabled,
    prices: plan.prices.map((price) => ({
      id: price.id,
      amountInCents: price.amountInCents,
      currency: price.currency,
      interval: price.interval,
      intervalCount: price.intervalCount,
    })),
  };
}
