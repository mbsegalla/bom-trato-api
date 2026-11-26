import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './env.validation.js';

const organizationId = '4586a4c1-924c-4a48-9949-a837e7540c2c';
const base = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://web.example.invalid',
  DATABASE_URL: 'postgresql://fixture:fixture@localhost:5432/fixture',
  STRIPE_SECRET_KEY: 'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  AUTH_JWT_SECRET: '1'.repeat(64),
  AUTH_CSRF_SECRET: '2'.repeat(64),
  NOTIFICATION_ENCRYPTION_KEY: '3'.repeat(64),
  QUOTE_SHARE_RATE_LIMIT_SECRET: '4'.repeat(64),
  RESEND_API_KEY: 'fixture',
  MAIL_FROM_EMAIL: 'fixture@example.invalid',
  MAIL_FROM_NAME: 'Fixture',
  STORAGE_S3_ENDPOINT: 'https://storage.example.invalid',
  STORAGE_S3_ACCESS_KEY_ID: 'fixture',
  STORAGE_S3_SECRET_ACCESS_KEY: 'fixture',
  STORAGE_BUCKET: 'fixture-bucket',
  STORAGE_PUBLIC_BASE_URL: 'https://assets.example.invalid',
  AUTH_GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
  ...Object.fromEntries([
    'VERIFY_EMAIL', 'RESET_PASSWORD', 'PASSWORD_CHANGED', 'ORGANIZATION_INVITATION',
    'PAYMENT_FAILED', 'PAYMENT_ACTION_REQUIRED', 'SUBSCRIPTION_CANCELED',
    'SUBSCRIPTION_ACTIVATED', 'PAYMENT_CONFIRMED', 'PLAN_CHANGE_CONFIRMED',
    'REVIEW_REQUEST', 'QUOTE_FOLLOW_UP', 'WORK_ORDER_REMINDER',
    'RECEIVABLE_DUE_SOON', 'RECEIVABLE_OVERDUE', 'TRIAL_LIFECYCLE',
  ].map((name) => ['RESEND_TEMPLATE_' + name, 'fixture-template'])),
};
const approved = {
  ...base,
  MERCADO_PAGO_ENABLED: 'true',
  MERCADO_PAGO_LIVE_MODE: 'true',
  MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: 'true',
  MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: 'true',
  MERCADO_PAGO_LIVE_WEBHOOK_SECRET: 'fixture-live-signing-secret',
  MERCADO_PAGO_CLIENT_ID: '123456789',
  MERCADO_PAGO_CLIENT_SECRET: 'fixture-client-secret',
  MERCADO_PAGO_ENCRYPTION_KEY: '5'.repeat(64),
  MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'true',
  MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID: organizationId,
  MERCADO_PAGO_LIVE_PILOT_ACCOUNT_ID: '123456',
  MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS: '10000',
  MERCADO_PAGO_LIVE_PIX_ENABLED: 'true',
};

describe('Mercado Pago production pilot configuration', () => {
  it('keeps issuance and approval disabled by default', () => {
    expect(validateEnvironment(base)).toMatchObject({
      MERCADO_PAGO_ENABLED: false, MERCADO_PAGO_LIVE_PIX_ENABLED: false, MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: false,
    });
  });

  it('allows only an explicitly approved bounded production pilot', () => {
    expect(validateEnvironment(approved)).toMatchObject({
      MERCADO_PAGO_LIVE_PIX_ENABLED: true,
      MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID: organizationId,
      MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS: 10_000,
    });
    for (const patch of [
      { NODE_ENV: 'development' },
      { MERCADO_PAGO_LIVE_MODE: 'false' },
      { MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'false' },
      { MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: 'false' },
      { MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: 'false' },
      { MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID: undefined },
      { MERCADO_PAGO_LIVE_PILOT_ACCOUNT_ID: undefined },
      { MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS: undefined },
      { MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS: '10001' },
      { FRONTEND_URL: 'http://localhost:3000' },
    ]) {
      expect(() => validateEnvironment({ ...approved, ...patch })).toThrow();
    }
  });

  it('supports stopping new issuance without disabling live reconciliation', () => {
    expect(validateEnvironment({
      ...approved, MERCADO_PAGO_LIVE_PIX_ENABLED: 'false', MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'false',
    })).toMatchObject({
      MERCADO_PAGO_LIVE_PIX_ENABLED: false, MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: true,
      MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: true,
    });
  });
});
