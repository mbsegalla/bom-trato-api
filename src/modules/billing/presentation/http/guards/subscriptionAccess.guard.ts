import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import type { AuthRequest } from '../../../../auth/presentation/http/authRequest.js';
import { Subscription } from '../../../domain/entities/subscription.entity.js';
import { BillingError } from '../../../domain/errors/billing.error.js';
import { BillingRepository } from '../../../domain/repositories/billing.repository.js';
import { billingOperation } from '../billingHttpError.js';

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(private readonly repository: BillingRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return billingOperation(async () => {
      const request = context.switchToHttp().getRequest<AuthRequest>();
      const organizationId = request.params.organizationId;
      const principal = request.auth;

      if (typeof organizationId !== 'string' || !isUUID(organizationId, '4') || principal === undefined) {
        throw new BillingError('ORGANIZATION_NOT_FOUND');
      }

      await this.repository.assertMember(organizationId, principal.user.id);

      const state = await this.repository.currentSubscription(organizationId);

      if (state === null || !Subscription.restore(state).hasAccessAt(new Date())) {
        throw new BillingError('SUBSCRIPTION_REQUIRED');
      }

      return true;
    });
  }
}
