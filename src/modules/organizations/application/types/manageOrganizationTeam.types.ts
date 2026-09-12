import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';

export interface InviteMemberParams extends OrganizationActorParams {
  email: string;
}

export interface InvitationActionParams extends OrganizationActorParams {
  invitationId: string;
}

export interface InvitationTokenParams {
  userId: string;
  token: string;
}

export interface RemoveMemberParams extends OrganizationActorParams {
  memberId: string;
}
