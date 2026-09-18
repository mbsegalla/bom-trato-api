import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';

export interface CreateOrganizationParams {
  userId: string;
  email: string;
  name: string;
  creationKey: string;
}

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
