import type { BillingLock } from '../../../billing/application/ports/billingLock.port.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import type { OrganizationTrialProps } from '../../domain/entities/organizationTrial.entity.js';
import { OrganizationTrialError } from '../../domain/errors/organizationTrial.error.js';
import type { OrganizationTrialActivation } from '../ports/organizationTrialActivation.port.js';

interface StartOrganizationTrialParams {
  organizationId: string;
  userId: string;
  name: string;
}

export class StartOrganizationTrialUseCase {
  constructor(
    private readonly activation: OrganizationTrialActivation,
    private readonly billingLock: BillingLock,
  ) {}

  async execute(params: StartOrganizationTrialParams): Promise<OrganizationTrialProps> {
    const { organizationId, userId, name: rawName } = params;

    const name = Organization.create({
      id: organizationId,
      ownerId: userId,
      name: rawName,
    }).snapshot().name;

    const result = await this.billingLock.run(`organization:${organizationId}`, () =>
      this.activation.activate({
        organizationId,
        userId,
        name,
      }),
    );

    if ('trial' in result) {
      return result.trial;
    }

    throw new OrganizationTrialError(result.status);
  }
}
