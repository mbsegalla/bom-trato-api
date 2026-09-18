import type { OrganizationInvitationStatus } from '../../../../generated/prisma/enums.js';
import type { OrganizationInvitation, OrganizationInvitationProps } from '../entities/organizationInvitation.entity.js';
import type { OrganizationPage, OrganizationPageParams } from '../types/organization.types.js';

export interface InvitationByIdParams {
  organizationId: string;
  invitationId: string;
}

export interface PendingInvitationParams {
  organizationId: string;
  email: string;
}

export interface InvitationPageParams extends OrganizationPageParams {
  status?: OrganizationInvitationStatus;
}

export interface ListInvitationsParams extends InvitationPageParams {
  organizationId: string;
  now: Date;
}

export interface InvalidateAcceptedInvitationsParams {
  organizationId: string;
  userId: string;
}

export interface InvitationLocator {
  id: string;
  organizationId: string;
}

export abstract class OrganizationInvitationRepository {
  abstract findById(params: InvitationByIdParams): Promise<OrganizationInvitationProps | null>;
  abstract findPending(params: PendingInvitationParams): Promise<OrganizationInvitationProps | null>;
  abstract findByTokenHash(tokenHash: string): Promise<InvitationLocator | null>;
  abstract create(invitation: OrganizationInvitation): Promise<void>;
  abstract save(invitation: OrganizationInvitation): Promise<void>;
  abstract invalidateAcceptedTokens(params: InvalidateAcceptedInvitationsParams): Promise<void>;
  abstract list(params: ListInvitationsParams): Promise<OrganizationPage<OrganizationInvitationProps>>;
}
