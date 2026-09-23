import type { UpdateBillingCustomerNameUseCase } from '../../../billing/application/useCases/updateBillingCustomerName.useCase.js';
import { Organization } from '../../../organizations/domain/entities/organization.entity.js';
import { OnboardingFlowPolicy } from '../../domain/policies/onboardingFlow.policy.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';

interface BootstrapParams {
  userId: string;
  email: string;
  userName: string;
}

export class OnboardingService {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly updateBillingCustomerName: UpdateBillingCustomerNameUseCase,
  ) {}

  async bootstrap(params: BootstrapParams) {
    const organizationId = await this.onboardingRepository.ensureOrganization({
      userId: params.userId,
      email: params.email,
      billingName: params.userName.trim(),
      provisionalOrganizationName: 'Meu negócio',
    });

    return this.state(params.userId, organizationId);
  }

  async state(userId: string, organizationId?: string) {
    const snapshot = await this.onboardingRepository.snapshot(userId, organizationId);

    return OnboardingFlowPolicy.resolve(snapshot, new Date());
  }

  async selectPlan(userId: string, organizationId: string, planPriceId: string) {
    await this.onboardingRepository.selectPlan(userId, organizationId, planPriceId);

    return this.state(userId, organizationId);
  }

  async completeBusiness(userId: string, organizationId: string, rawName: string) {
    const name = Organization.create({
      id: organizationId,
      ownerId: userId,
      name: rawName,
    }).snapshot().name;

    await this.updateBillingCustomerName.execute({
      organizationId,
      name,
    });

    await this.onboardingRepository.completeBusinessSetup({
      userId,
      organizationId,
      name,
    });

    return this.state(userId, organizationId);
  }
}
