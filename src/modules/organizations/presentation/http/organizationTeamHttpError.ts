import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { OrganizationTeamErrorCode } from '../../domain/errors/organizationTeam.error.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  OWNER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  MEMBER_NOT_FOUND: HttpStatus.NOT_FOUND,
  OWNER_REMOVAL_FORBIDDEN: HttpStatus.FORBIDDEN,
  ALREADY_MEMBER: HttpStatus.CONFLICT,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  TEAM_MANAGEMENT_REQUIRED: HttpStatus.FORBIDDEN,
  MEMBER_LIMIT_REACHED: HttpStatus.CONFLICT,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  INVITATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVITATION_EXPIRED: HttpStatus.GONE,
  INVITATION_CLOSED: HttpStatus.CONFLICT,
  INVITATION_ALREADY_PENDING: HttpStatus.CONFLICT,
  INVITATION_EMAIL_MISMATCH: HttpStatus.FORBIDDEN,
  INVITATION_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  TEAM_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<OrganizationTeamErrorCode, HttpStatus>;

export async function organizationTeamOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof OrganizationTeamError)) {
      throw error;
    }

    throw new ApiException(statuses[error.code], error.code, error.code.toLowerCase().replaceAll('_', ' '));
  }
}
