import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

export class GetOnboardingStateUseCase {
  constructor(private readonly onboardingApplicationService: OnboardingApplicationService) {}

  execute(userId: string, organizationId?: string): Promise<OnboardingState> {
    return this.onboardingApplicationService.state(userId, organizationId);
  }
}
