import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type {
  PortalPortfolioStatus,
  PortfolioConsentInput,
  PortfolioManagementParams,
  PortfolioManagementStatus,
  PortfolioPublicationInput,
  PublicPortfolioPhoto,
} from '../types/workOrderPortfolio.types.js';

export abstract class WorkOrderPortfolioRepository {
  abstract getPortalStatus(tokenHash: string): Promise<PortalPortfolioStatus>;
  abstract consent(tokenHash: string, input: PortfolioConsentInput): Promise<PortalPortfolioStatus>;
  abstract revoke(tokenHash: string, photoId: string): Promise<PortalPortfolioStatus>;
  abstract listForOrganization(params: WorkOrderByIdParams): Promise<PortfolioManagementStatus>;
  abstract publish(
    params: PortfolioManagementParams,
    input: PortfolioPublicationInput,
  ): Promise<PortfolioManagementStatus>;
  abstract revokeForOrganization(params: PortfolioManagementParams): Promise<PortfolioManagementStatus>;
  abstract listPublishedForSlug(slug: string): Promise<PublicPortfolioPhoto[]>;
  abstract getPublicPhotoKey(slug: string, photoId: string): Promise<string>;
}
