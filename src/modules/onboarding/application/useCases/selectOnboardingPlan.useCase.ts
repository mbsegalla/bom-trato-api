import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

export class SelectOnboardingPlanUseCase {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly onboardingApplicationService: OnboardingApplicationService,
  ) {}

  async execute(userId: string, organizationId: string, planPriceId: string): Promise<OnboardingState> {
    await this.onboardingRepository.selectPlan(userId, organizationId, planPriceId);

    return this.onboardingApplicationService.state(userId, organizationId);
  }
}
