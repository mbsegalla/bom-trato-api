import type { SubscriptionProps } from '../../../billing/domain/entities/subscription.entity.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import type { OrganizationTrialProps } from '../entities/organizationTrial.entity.js';
import { OrganizationTrial } from '../entities/organizationTrial.entity.js';

export type OrganizationPlatformAccessSource = 'SUBSCRIPTION' | 'TRIAL' | 'NONE';

export interface OrganizationPlatformAccessContext {
  organizationId: string;
  subscriptions: SubscriptionProps[];
  trial: OrganizationTrialProps | null;
  hasPaidSubscriptionHistory: boolean;
}

export interface OrganizationPlatformAccess {
  hasAccess: boolean;
  source: OrganizationPlatformAccessSource;
  billingNeedsReconciliation: boolean;
}

export class OrganizationPlatformAccessPolicy {
  static resolve(context: OrganizationPlatformAccessContext, now: Date): OrganizationPlatformAccess {
    const { organizationId, subscriptions, trial, hasPaidSubscriptionHistory } = context;

    const ongoingSubscriptions = subscriptions.filter((subscription) =>
      Subscription.blocksNewCheckout(subscription.status),
    );

    if (ongoingSubscriptions.length > 1) {
      return {
        hasAccess: false,
        source: 'NONE',
        billingNeedsReconciliation: true,
      };
    }

    const currentSubscription = ongoingSubscriptions[0];

    if (
      currentSubscription !== undefined &&
      currentSubscription.organizationId === organizationId &&
      Subscription.restore(currentSubscription).hasAccessAt(now)
    ) {
      return {
        hasAccess: true,
        source: 'SUBSCRIPTION',
        billingNeedsReconciliation: false,
      };
    }

    if (
      !hasPaidSubscriptionHistory &&
      !subscriptions.some((subscription) => subscription.paidThrough !== null) &&
      trial !== null &&
      trial.organizationId === organizationId &&
      OrganizationTrial.restore(trial).hasAccessAt(now)
    ) {
      return {
        hasAccess: true,
        source: 'TRIAL',
        billingNeedsReconciliation: false,
      };
    }

    return {
      hasAccess: false,
      source: 'NONE',
      billingNeedsReconciliation: false,
    };
  }
}
