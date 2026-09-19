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
    } & PlanChangeNotification);

export interface EnqueueNotification {
  key: string;
  recipient: string;
  content: NotificationContent;
  expiresAt: Date;
}

export interface NotificationMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface NotificationJob {
  id: string;
  encryptedPayload: string | null;
  leaseToken: string | null;
  attempts: number;
  expiresAt: Date;
  firstAttemptAt: Date | null;
}

export interface RenderedNotificationEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailLayoutParams {
  subject: string;
  bodyHtml: string;
  text: string;
  actionUrl: string;
  actionLabel: string;
}

export interface BillingPaymentNotification {
  organizationName: string;
  invoiceNumber: string | null;
  amountPaidInCents: number;
  currency: string;
}

export interface PlanChangeNotification {
  organizationName: string;
  planName: string;
}
