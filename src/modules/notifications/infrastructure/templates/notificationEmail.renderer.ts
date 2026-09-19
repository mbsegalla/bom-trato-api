import type {
  EnqueueNotification,
  NotificationMessage,
  RenderedNotificationEmail,
} from '../../application/types/notification.types.js';

import { organizationInvitationTemplate } from './organizationInvitation.template.js';
import { passwordChangedTemplate } from './passwordChanged.template.js';
import { paymentActionRequiredTemplate } from './paymentActionRequired.template.js';
import { paymentConfirmedTemplate } from './paymentConfirmed.template.js';
import { paymentFailedTemplate } from './paymentFailed.template.js';
import { planChangeConfirmedTemplate } from './planChangeConfirmed.template.js';
import { resetPasswordTemplate } from './resetPassword.template.js';
import { subscriptionActivatedTemplate } from './subscriptionActivated.template.js';
import { subscriptionCanceledTemplate } from './subscriptionCanceled.template.js';
import { verifyEmailTemplate } from './verifyEmail.template.js';

function frontendLink(frontendUrl: string, path: string, token?: string): string {
  const url = new URL(path, frontendUrl);

  if (token !== undefined) {
    url.hash = new URLSearchParams({ token }).toString();
  }

  return url.toString();
}

function renderTemplate(input: EnqueueNotification, frontendUrl: string): RenderedNotificationEmail {
  const { content, expiresAt } = input;

  switch (content.type) {
    case 'VERIFY_EMAIL':
      return verifyEmailTemplate(frontendLink(frontendUrl, '/verify-email', content.token), expiresAt);
    case 'RESET_PASSWORD':
      return resetPasswordTemplate(frontendLink(frontendUrl, '/reset-password', content.token), expiresAt);
    case 'PASSWORD_CHANGED':
      return passwordChangedTemplate(frontendLink(frontendUrl, '/'));
    case 'ORGANIZATION_INVITATION':
      return organizationInvitationTemplate(
        frontendLink(frontendUrl, '/organization-invitations/accept', content.token),
        content.organizationName,
        expiresAt,
      );
    case 'PAYMENT_FAILED':
      return paymentFailedTemplate(frontendLink(frontendUrl, '/'), content.organizationName);
    case 'PAYMENT_ACTION_REQUIRED':
      return paymentActionRequiredTemplate(frontendLink(frontendUrl, '/'), content.organizationName);
    case 'SUBSCRIPTION_CANCELED':
      return subscriptionCanceledTemplate(frontendLink(frontendUrl, '/'), content.organizationName);
    case 'SUBSCRIPTION_ACTIVATED':
      return subscriptionActivatedTemplate(frontendLink(frontendUrl, '/'), content);
    case 'PAYMENT_CONFIRMED':
      return paymentConfirmedTemplate(frontendLink(frontendUrl, '/'), content);
    case 'PLAN_CHANGE_CONFIRMED':
      return planChangeConfirmedTemplate(frontendLink(frontendUrl, '/'), content);
  }
}

export function renderNotificationEmail(
  input: EnqueueNotification,
  frontendUrl: string,
  from: string,
): NotificationMessage {
  const rendered = renderTemplate(input, frontendUrl);

  return {
    from,
    to: input.recipient,
    ...rendered,
  };
}
