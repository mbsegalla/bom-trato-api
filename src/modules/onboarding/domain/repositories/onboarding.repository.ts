import type { OnboardingSnapshot } from '../types/onboarding.types.js';

export interface EnsureOnboardingOrganizationParams {
  userId: string;
  email: string;
  billingName: string;
  provisionalOrganizationName: string;
}

export interface CompleteBusinessSetupParams {
  userId: string;
  organizationId: string;
  name: string;
}

export abstract class OnboardingRepository {
  abstract snapshot(userId: string, organizationId?: string): Promise<OnboardingSnapshot>;
  abstract ensureOrganization(params: EnsureOnboardingOrganizationParams): Promise<string>;
  abstract selectPlan(userId: string, organizationId: string, planPriceId: string): Promise<void>;
  abstract completeBusinessSetup(params: CompleteBusinessSetupParams): Promise<void>;
}
