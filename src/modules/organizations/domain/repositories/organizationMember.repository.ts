import type { OrganizationRole } from '../../../../generated/prisma/enums.js';
import type { OrganizationPage, OrganizationPageParams } from '../types/organizationPage.types.js';

export interface OrganizationMemberView {
  id: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
  user: {
    name: string;
  };
}

export interface JoinedOrganizationView {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface MemberByUserParams {
  organizationId: string;
  userId: string;
}

export interface MemberByIdParams {
  organizationId: string;
  memberId: string;
}

export interface MemberByEmailParams {
  organizationId: string;
  email: string;
}

export interface ListMembersParams extends OrganizationPageParams {
  organizationId: string;
}

export interface ListJoinedOrganizationsParams extends OrganizationPageParams {
  userId: string;
}

export abstract class OrganizationMemberRepository {
  abstract count(organizationId: string): Promise<number>;
  abstract findByUser(params: MemberByUserParams): Promise<OrganizationMemberView | null>;
  abstract findById(params: MemberByIdParams): Promise<OrganizationMemberView | null>;
  abstract existsByEmail(params: MemberByEmailParams): Promise<boolean>;
  abstract add(params: MemberByUserParams): Promise<void>;
  abstract remove(params: MemberByIdParams): Promise<void>;
  abstract list(params: ListMembersParams): Promise<OrganizationPage<OrganizationMemberView>>;
  abstract listJoined(params: ListJoinedOrganizationsParams): Promise<OrganizationPage<JoinedOrganizationView>>;
}
