import { Onboarding } from '../../domain/onboardingState.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';

export class OnboardingService {
  constructor(private readonly onboardingRepository: OnboardingRepository) {}

  async state(userId: string, organizationId?: string) {
    const snapshot = await this.onboardingRepository.snapshot(userId, organizationId);

    return Onboarding.resolve(snapshot, new Date());
  }

  async selectPlan(userId: string, organizationId: string, planPriceId: string) {
    await this.onboardingRepository.selectPlan(userId, organizationId, planPriceId);

    return this.state(userId, organizationId);
  }
}
