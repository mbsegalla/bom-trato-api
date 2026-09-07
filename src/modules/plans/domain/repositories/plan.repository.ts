import type { Plan } from '../entities/plan.entity.js';

export abstract class PlanRepository {
  abstract findAvailable(): Promise<Plan[]>;
}
