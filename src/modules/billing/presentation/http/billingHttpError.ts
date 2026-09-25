import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { BillingErrorCode } from '../../domain/errors/billing.error.js';
import { BillingError } from '../../domain/errors/billing.error.js';

interface BillingHttpErrorDefinition {
  status: HttpStatus;
  message: string;
}

const billingHttpErrors = {
  ORGANIZATION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Organization not found.',
  },
  OWNER_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only the organization owner can perform this action.',
  },
  EMAIL_NOT_VERIFIED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Verify your email before managing billing.',
  },
  PLAN_UNAVAILABLE: {
    status: HttpStatus.CONFLICT,
    message: 'The selected plan is unavailable.',
  },
  PRICE_MISMATCH: {
    status: HttpStatus.CONFLICT,
    message: 'The selected price has changed. Please refresh the available plans.',
  },
  SUBSCRIPTION_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'The organization already has a subscription that prevents a new checkout.',
  },
  SUBSCRIPTION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Subscription not found.',
  },
  SUBSCRIPTION_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'A valid subscription is required to access this resource.',
  },
  INVALID_SUBSCRIPTION_STATE: {
    status: HttpStatus.CONFLICT,
    message: 'The subscription does not allow this operation in its current state.',
  },
  CHECKOUT_IN_PROGRESS: {
    status: HttpStatus.CONFLICT,
    message: 'A checkout for another plan is already in progress.',
  },
  CHECKOUT_EXPIRED: {
    status: HttpStatus.CONFLICT,
    message: 'This checkout attempt can no longer be started.',
  },
  BILLING_BUSY: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Another billing operation is in progress. Please try again shortly.',
  },
  BILLING_RECONCILIATION_REQUIRED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Billing information requires reconciliation before this operation can continue.',
  },
  BILLING_READ_FAILED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Billing information could not be retrieved. Please try again shortly.',
  },
  BILLING_WRITE_FAILED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Billing information could not be updated. Please try again shortly.',
  },
  INVALID_WEBHOOK: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Invalid webhook signature or payload.',
  },
  INVALID_CURSOR: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Invalid pagination cursor.',
  },
  MULTIPLE_SUBSCRIPTIONS: {
    status: HttpStatus.CONFLICT,
    message: 'Multiple ongoing subscriptions require billing reconciliation.',
  },
  BILLING_PORTAL_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'The billing portal is not configured for this operation.',
  },
  PAYMENT_METHOD_UPDATE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Payment method update not found.',
  },
  INVALID_PAYMENT_METHOD_UPDATE: {
    status: HttpStatus.CONFLICT,
    message: 'The payment method update is not valid for this organization.',
  },
  PLAN_CHANGE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Plan change not found.',
  },
  PLAN_CHANGE_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Another billing change is pending or the subscription cannot be changed now.',
  },
  PLAN_CHANGE_SAME_PRICE: {
    status: HttpStatus.CONFLICT,
    message: 'The subscription already uses this price.',
  },
  PLAN_CHANGE_QUOTE_EXPIRED: {
    status: HttpStatus.CONFLICT,
    message: 'The quote is no longer valid. Request a new preview.',
  },
  PLAN_CHANGE_UNSUPPORTED: {
    status: HttpStatus.CONFLICT,
    message: 'The subscription configuration is not supported by this plan change flow.',
  },
  PLAN_MEMBER_LIMIT: {
    status: HttpStatus.CONFLICT,
    message: 'Remove members before switching to a plan with a lower member limit.',
  },
} satisfies Record<BillingErrorCode, BillingHttpErrorDefinition>;

export function billingOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is BillingError => error instanceof BillingError,
    (error) => ({
      ...billingHttpErrors[error.code],
      code: error.code,
    }),
  );
}
