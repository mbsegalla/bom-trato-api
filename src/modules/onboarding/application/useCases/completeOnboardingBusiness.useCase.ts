import type { UpdateBillingCustomerNameUseCase } from '../../../billing/application/useCases/updateBillingCustomerName.useCase.js';
import { BillingError } from '../../../billing/domain/errors/billing.error.js';
import type { BillingRepository } from '../../../billing/domain/repositories/billing.repository.js';
import type { StartOrganizationTrialUseCase } from '../../../organizations/application/useCases/startOrganizationTrial.useCase.js';
import { Organization } from '../../../organizations/domain/entities/organization.entity.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import { OnboardingStep } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

export class CompleteOnboardingBusinessUseCase {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly onboardingApplicationService: OnboardingApplicationService,
    private readonly updateBillingCustomerNameUseCase: UpdateBillingCustomerNameUseCase,
    private readonly startOrganizationTrialUseCase: StartOrganizationTrialUseCase,
    private readonly billingRepository: BillingRepository,
  ) {}

  async execute(userId: string, organizationId: string, rawName: string): Promise<OnboardingState> {
    await this.billingRepository.assertOwner(organizationId, userId);

    const state = await this.onboardingApplicationService.state(userId, organizationId);

    if (state.step === OnboardingStep.App) {
      return state;
    }

    if (state.step === OnboardingStep.BillingReview) {
      throw new BillingError('MULTIPLE_SUBSCRIPTIONS');
    }

    if (state.step !== OnboardingStep.CreateBusiness) {
      throw new BillingError('SUBSCRIPTION_REQUIRED');
    }

    const name = Organization.create({
      id: organizationId,
      ownerId: userId,
      name: rawName,
    }).snapshot().name;

    if (state.trialEligible) {
      await this.startOrganizationTrialUseCase.execute({
        organizationId,
        userId,
        name,
      });

      return this.onboardingApplicationService.state(userId, organizationId);
    }

    if (state.accessSource !== 'SUBSCRIPTION') {
      throw new BillingError('SUBSCRIPTION_REQUIRED');
    }

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
