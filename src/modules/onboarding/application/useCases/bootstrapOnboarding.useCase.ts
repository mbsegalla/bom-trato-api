import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

interface BootstrapOnboardingParams {
  userId: string;
  email: string;
  userName: string;
}

export class BootstrapOnboardingUseCase {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly onboardingApplicationService: OnboardingApplicationService,
  ) {}

  async execute(params: BootstrapOnboardingParams): Promise<OnboardingState> {
    const { userId, email, userName } = params;

    const organizationId = await this.onboardingRepository.ensureOrganization({
      userId,
      email,
      billingName: userName.trim(),
      provisionalOrganizationName: 'Meu negócio',
    });

    return this.onboardingApplicationService.state(userId, organizationId);
  }
}
