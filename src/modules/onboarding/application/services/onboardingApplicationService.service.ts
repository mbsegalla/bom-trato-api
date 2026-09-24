import { OnboardingFlowPolicy } from '../../domain/policies/onboardingFlow.policy.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';

export class OnboardingApplicationService {
  constructor(private readonly onboardingRepository: OnboardingRepository) {}

  async state(userId: string, organizationId?: string): Promise<OnboardingState> {
    const snapshot = await this.onboardingRepository.snapshot(userId, organizationId);

    return OnboardingFlowPolicy.resolve(snapshot, new Date());
  }
}
