import type { AutomationEntityType, AutomationType } from '../../../../generated/prisma/enums.js';

export type NotificationContent =
  | {
      type: 'VERIFY_EMAIL' | 'RESET_PASSWORD';
      token: string;
    }
  | {
      type: 'PASSWORD_CHANGED';
    }
  | {
      type: 'ORGANIZATION_INVITATION';
      token: string;
      organizationName: string;
    }
  | {
      type: 'PAYMENT_FAILED' | 'PAYMENT_ACTION_REQUIRED' | 'SUBSCRIPTION_CANCELED';
      organizationName: string;
    }
  | ({
      type: 'SUBSCRIPTION_ACTIVATED' | 'PAYMENT_CONFIRMED';
    } & BillingPaymentNotification)
  | ({
      type: 'PLAN_CHANGE_CONFIRMED';
    } & PlanChangeNotification)
  | {
      type: 'REVIEW_REQUEST';
      token: string;
      customerName: string;
      organizationName: string;
      workOrderTitle: string;
    }
  | {
      type: 'QUOTE_FOLLOW_UP';
      token: string;
      customerName: string;
      organizationName: string;
      quoteTitle: string;
    }
  | {
      type: 'WORK_ORDER_REMINDER';
      customerName: string;
      organizationName: string;
      workOrderTitle: string;
      scheduledStartAt: string;
    }
  | {
      type: 'RECEIVABLE_DUE_SOON' | 'RECEIVABLE_OVERDUE';
      customerName: string;
      organizationName: string;
      receivableTitle: string;
      amountDueInCents: number;
      dueAt: string;
    };

export interface AutomationNotificationMetadata {
  organizationId: string;
  type: AutomationType;
  entityType: AutomationEntityType;
  entityId: string;
  contextId?: string;
  referenceAt?: Date;
  description: string;
  href: string;
}

export interface EnqueueNotification {
  key: string;
  recipient: string;
  content: NotificationContent;
  availableAt?: Date;
  expiresAt: Date;
  automation?: AutomationNotificationMetadata;
}

export type NotificationTemplateVariables = Record<string, string | number>;

export interface NotificationTemplate {
  id: string;
  variables: NotificationTemplateVariables;
}

export interface NotificationMessage {
  from: string;
  to: string;
  template: NotificationTemplate;
}

export interface NotificationJob {
  id: string;
  encryptedPayload: string | null;
  leaseToken: string | null;
  attempts: number;
  expiresAt: Date;
  firstAttemptAt: Date | null;
  organizationId: string | null;
  automationType: AutomationType | null;
  automationEntityId: string | null;
  automationContextId: string | null;
  automationReferenceAt: Date | null;
}

export interface BillingPaymentNotification {
  invoiceNumber: string | null;
  amountPaidInCents: number;
  currency: string;
}

export interface PlanChangeNotification {
  organizationName: string;
  planName: string;
}
