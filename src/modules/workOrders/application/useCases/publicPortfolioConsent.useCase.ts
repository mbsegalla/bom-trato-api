import type { WorkOrderPortfolioRepository } from '../ports/workOrderPortfolio.repository.js';
import type { WorkOrderShareSecurity } from '../ports/workOrderShareSecurity.port.js';
import type { PortalPortfolioStatus, PortfolioConsentInput } from '../types/workOrderPortfolio.types.js';

export class PublicPortfolioConsentUseCase {
  constructor(
    private readonly repository: WorkOrderPortfolioRepository,
    private readonly security: WorkOrderShareSecurity,
  ) {}

  status(token: string): Promise<PortalPortfolioStatus> {
    return this.repository.getPortalStatus(this.security.hash(token));
  }

  consent(token: string, input: PortfolioConsentInput): Promise<PortalPortfolioStatus> {
    return this.repository.consent(this.security.hash(token), input);
  }

  revoke(token: string, photoId: string): Promise<PortalPortfolioStatus> {
    return this.repository.revoke(this.security.hash(token), photoId);
  }
}
