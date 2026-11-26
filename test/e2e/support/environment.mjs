import { existsSync } from 'node:fs';

export const databaseUrl = 'postgresql://bom_trato_e2e:e2e_only_password@127.0.0.1:5432/bom_trato_e2e?schema=public';
export const frontendOrigin = 'http://127.0.0.1:3100';
export const apiOrigin = 'http://127.0.0.1:5000';

// These keys belong only to the disposable full-stack environment.
export const notificationKey = '3'.repeat(64);

export function assertDisposableEnvironment() {
  if (process.env.BOM_TRATO_E2E !== '1' || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error('Full-stack E2E requires explicit opt-in and the dedicated loopback database');
  }

  if (existsSync('.env')) {
    throw new Error('Full-stack E2E refuses to load an existing backend .env file');
  }
}

export function applicationEnvironment() {
  assertDisposableEnvironment();

  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TZ: 'UTC',
    NODE_ENV: 'test',
    PORT: '5000',
    FRONTEND_URL: frontendOrigin,
    DATABASE_URL: databaseUrl,
    STRIPE_SECRET_KEY: 'sk_test_E2EPlaceholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_E2EPlaceholder',
    AUTH_JWT_SECRET: '1'.repeat(64),
    AUTH_CSRF_SECRET: '2'.repeat(64),
    NOTIFICATION_ENCRYPTION_KEY: notificationKey,
    QUOTE_SHARE_RATE_LIMIT_SECRET: '4'.repeat(64),
    RECEIVING_SETTINGS_ENCRYPTION_KEY: '5'.repeat(64),
    AUTH_GOOGLE_CLIENT_ID: 'e2e-placeholder.apps.googleusercontent.com',
    RESEND_API_KEY: 're_e2e_placeholder',
    MAIL_FROM_EMAIL: 'e2e@example.com',
    MAIL_FROM_NAME: 'Bom Trato E2E',
    RESEND_TEMPLATE_VERIFY_EMAIL: 'fixture_verify_email',
    RESEND_TEMPLATE_RESET_PASSWORD: 'fixture_reset_password',
    RESEND_TEMPLATE_PASSWORD_CHANGED: 'fixture_password_changed',
    RESEND_TEMPLATE_ORGANIZATION_INVITATION: 'fixture_organization_invitation',
    RESEND_TEMPLATE_PAYMENT_FAILED: 'fixture_payment_failed',
    RESEND_TEMPLATE_PAYMENT_ACTION_REQUIRED: 'fixture_payment_action_required',
    RESEND_TEMPLATE_SUBSCRIPTION_CANCELED: 'fixture_subscription_canceled',
    RESEND_TEMPLATE_SUBSCRIPTION_ACTIVATED: 'fixture_subscription_activated',
    RESEND_TEMPLATE_PAYMENT_CONFIRMED: 'fixture_payment_confirmed',
    RESEND_TEMPLATE_PLAN_CHANGE_CONFIRMED: 'fixture_plan_change_confirmed',
    RESEND_TEMPLATE_REVIEW_REQUEST: 'fixture_review_request',
    RESEND_TEMPLATE_QUOTE_FOLLOW_UP: 'fixture_quote_follow_up',
    RESEND_TEMPLATE_WORK_ORDER_REMINDER: 'fixture_work_order_reminder',
    RESEND_TEMPLATE_RECEIVABLE_DUE_SOON: 'fixture_receivable_due_soon',
    RESEND_TEMPLATE_RECEIVABLE_OVERDUE: 'fixture_receivable_overdue',
    STORAGE_S3_ENDPOINT: 'http://127.0.0.1:9',
    STORAGE_S3_REGION: 'us-east-1',
    STORAGE_S3_ACCESS_KEY_ID: 'e2e-placeholder',
    STORAGE_S3_SECRET_ACCESS_KEY: 'e2e-placeholder',
    STORAGE_BUCKET: 'bom-trato-e2e-public',
    STORAGE_PRIVATE_BUCKET: 'bom-trato-e2e-private',
    STORAGE_PUBLIC_BASE_URL: 'http://127.0.0.1:9',
    BILLING_WORKER_ENABLED: 'false',
    NOTIFICATION_WORKER_ENABLED: 'false',
    AUTH_CLEANUP_WORKER_ENABLED: 'false',
    QUOTE_SHARE_CLEANUP_WORKER_ENABLED: 'false',
    TRIAL_LIFECYCLE_WORKER_ENABLED: 'false',
    WORK_ORDER_RECURRENCE_WORKER_ENABLED: 'false',
    WORK_ORDER_RECURRENCE_REMINDER_WORKER_ENABLED: 'false',
    MERCADO_PAGO_ENABLED: 'false',
    MERCADO_PAGO_LIVE_MODE: 'false',
    MERCADO_PAGO_SANDBOX_PIX_ENABLED: 'false',
    MERCADO_PAGO_LIVE_PIX_ENABLED: 'false',
    MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'false',
    MERCADO_PAGO_WEBHOOK_ENABLED: 'false',
    MERCADO_PAGO_WEBHOOK_WORKER_ENABLED: 'false',
    MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: 'false',
    MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: 'false',
    NEW_RELIC_ENABLED: 'false',
    BOM_TRATO_E2E: '1',
  };
}
