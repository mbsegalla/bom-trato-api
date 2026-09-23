import type { OnboardingSnapshot } from '../onboardingState.js';

export abstract class OnboardingRepository {
  abstract snapshot(userId: string, organizationId?: string): Promise<OnboardingSnapshot>;
  abstract selectPlan(userId: string, organizationId: string, planPriceId: string): Promise<void>;
}
