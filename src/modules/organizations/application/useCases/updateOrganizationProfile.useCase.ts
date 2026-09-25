import type { UpdateBillingCustomerNameUseCase } from '../../../billing/application/useCases/updateBillingCustomerName.useCase.js';
import type { OrganizationBusinessDetails } from '../../domain/entities/organization.entity.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

interface PreparedOrganizationUpdate {
  name: string;
  nameChanged: boolean;
}

export class UpdateOrganizationProfileUseCase {
  constructor(
    private readonly processor: OrganizationTeamApplicationService,
    private readonly updateBillingCustomerNameUseCase: UpdateBillingCustomerNameUseCase,
  ) {}

  async execute(params: OrganizationActorParams, details: Partial<OrganizationBusinessDetails>) {
    const prepared = await this.processor.readTeam(
      params,
      async (context, policy): Promise<PreparedOrganizationUpdate> => {
        policy.assertOwner();

        const organization = Organization.restore(context.organization);
        const currentName = organization.snapshot().name;

        organization.update(details);

        const next = organization.snapshot();

        return {
          name: next.name,
          nameChanged: next.name !== currentName,
        };
      },
    );

    if (prepared.nameChanged) {
      await this.updateBillingCustomerNameUseCase.execute({
        organizationId: params.organizationId,
        name: prepared.name,
      });
    }

    return this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const organization = Organization.restore(tx.organization);

      organization.update(details);

      await tx.saveOrganization(organization.snapshot());

      return organization.profile();
    });
  }
}
