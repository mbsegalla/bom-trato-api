import type { Plan } from '../../domain/entities/plan.entity.js';
import type { PlanRepository } from '../../domain/repositories/plan.repository.js';

export class ListPlansUseCase {
  constructor(private readonly planRepository: PlanRepository) {}

  execute(): Promise<Plan[]> {
    return this.planRepository.findAvailable();
  }
}
