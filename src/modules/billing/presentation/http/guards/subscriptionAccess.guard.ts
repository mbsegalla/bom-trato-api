import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import type { AuthRequest } from '../../../../auth/presentation/http/authRequest.js';
import { OrganizationPlatformAccessReader } from '../../../../organizations/application/ports/organizationPlatformAccessReader.port.js';
import { BillingError } from '../../../domain/errors/billing.error.js';
import { billingOperation } from '../billingHttpError.js';

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(private readonly platformAccessReader: OrganizationPlatformAccessReader) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return billingOperation(async () => {
      const request = context.switchToHttp().getRequest<AuthRequest>();
      const organizationId = request.params.organizationId;
      const principal = request.auth;

      if (typeof organizationId !== 'string' || !isUUID(organizationId, '4') || principal === undefined) {
        throw new BillingError('ORGANIZATION_NOT_FOUND');
      }

      const access = await this.platformAccessReader.read({
        organizationId,
        userId: principal.user.id,
      });

      if (!access.isMember) {
        throw new BillingError('ORGANIZATION_NOT_FOUND');
      }

      if (!access.verified) {
        throw new BillingError('EMAIL_NOT_VERIFIED');
      }

      if (access.billingNeedsReconciliation) {
        throw new BillingError('MULTIPLE_SUBSCRIPTIONS');
      }

      if (!access.hasPlatformAccess) {
        throw new BillingError('SUBSCRIPTION_REQUIRED');
      }

      return true;
    });
  }
}
