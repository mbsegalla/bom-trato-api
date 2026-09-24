import type { UpdateBillingCustomerNameUseCase } from '../../../billing/application/useCases/updateBillingCustomerName.useCase.js';
import { Organization } from '../../../organizations/domain/entities/organization.entity.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

export class CompleteOnboardingBusinessUseCase {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly onboardingApplicationService: OnboardingApplicationService,
    private readonly updateBillingCustomerNameUseCase: UpdateBillingCustomerNameUseCase,
  ) {}

  async execute(userId: string, organizationId: string, rawName: string): Promise<OnboardingState> {
    const name = Organization.create({
      id: organizationId,
      ownerId: userId,
      name: rawName,
    }).snapshot().name;

    await this.updateBillingCustomerNameUseCase.execute({
      organizationId,
      name,
    });

    await this.onboardingRepository.completeBusinessSetup({
      userId,
      organizationId,
      name,
    });

    return this.onboardingApplicationService.state(userId, organizationId);
  }
}
