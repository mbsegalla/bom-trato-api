import type { WorkOrderPhotoStage } from '../../../../generated/prisma/enums.js';
import type { WorkOrderByIdParams } from './workOrder.types.js';

export const WORK_ORDER_PORTFOLIO_CONSENT_VERSION = '1';
export const WORK_ORDER_PORTFOLIO_CONSENT_TEXT =
  'Autorizo expressamente a divulgação pública das fotografias selecionadas do meu atendimento no portfólio da empresa, sem informações pessoais.';

export interface PortfolioConsentInput {
  photoIds: string[];
  signerName: string;
  consent: true;
  consentVersion: string;
}

export interface PortalPortfolioStatus {
  canAuthorize: boolean;
  photos: Array<{ id: string; consented: boolean; published: boolean }>;
}

export interface PortfolioManagementStatus {
  photos: Array<{
    id: string;
    stage: WorkOrderPhotoStage;
    visibleInPortal: boolean;
    consented: boolean;
    published: boolean;
  }>;
}

export interface PublicPortfolioPhoto {
  id: string;
  stage: 'BEFORE' | 'AFTER';
  width: number;
  height: number;
}

export interface PortfolioManagementParams extends WorkOrderByIdParams {
  photoId: string;
}

export interface PortfolioPublicationInput {
  publish: boolean;
}
