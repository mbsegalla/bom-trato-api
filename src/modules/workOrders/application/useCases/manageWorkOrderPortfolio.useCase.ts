import type { WorkOrderPortfolioRepository } from '../ports/workOrderPortfolio.repository.js';
import type {
  PortfolioManagementParams,
  PortfolioManagementStatus,
  PortfolioPublicationInput,
} from '../types/workOrderPortfolio.types.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class ManageWorkOrderPortfolioUseCase {
  constructor(private readonly repository: WorkOrderPortfolioRepository) {}

  list(params: WorkOrderByIdParams): Promise<PortfolioManagementStatus> {
    return this.repository.listForOrganization(params);
  }

  revoke(params: PortfolioManagementParams): Promise<PortfolioManagementStatus> {
    return this.repository.revokeForOrganization(params);
  }

  publish(params: PortfolioManagementParams, input: PortfolioPublicationInput): Promise<PortfolioManagementStatus> {
    return this.repository.publish(params, input);
  }
}
