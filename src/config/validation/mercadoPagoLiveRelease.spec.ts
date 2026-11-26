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
    'VERIFY_EMAIL',
    'RESET_PASSWORD',
    'PASSWORD_CHANGED',
    'ORGANIZATION_INVITATION',
    'PAYMENT_FAILED',
    'PAYMENT_ACTION_REQUIRED',
    'SUBSCRIPTION_CANCELED',
    'SUBSCRIPTION_ACTIVATED',
    'PAYMENT_CONFIRMED',
    'PLAN_CHANGE_CONFIRMED',
    'REVIEW_REQUEST',
    'QUOTE_FOLLOW_UP',
    'WORK_ORDER_REMINDER',
    'RECEIVABLE_DUE_SOON',
    'RECEIVABLE_OVERDUE',
    'TRIAL_LIFECYCLE',
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
      MERCADO_PAGO_ENABLED: false,
      MERCADO_PAGO_LIVE_PIX_ENABLED: false,
      MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: false,
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
      ...approved,
      MERCADO_PAGO_LIVE_PIX_ENABLED: 'false',
      MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'false',
    })).toMatchObject({
      MERCADO_PAGO_LIVE_PIX_ENABLED: false,
      MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: true,
      MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: true,
    });
  });
});

describe('environment security and configuration boundaries', () => {
  it('applies numeric and boolean defaults', () => {
    expect(validateEnvironment(base)).toMatchObject({
      PORT: 5000,
      AUTH_ACCESS_TTL_SECONDS: 900,
      AUTH_IDLE_TTL_SECONDS: 604800,
      AUTH_ABSOLUTE_TTL_SECONDS: 2592000,
      AUTH_RETENTION_DAYS: 30,
      AUTH_CLEANUP_WORKER_ENABLED: true,
      BILLING_WORKER_ENABLED: true,
      NOTIFICATION_WORKER_ENABLED: true,
      MERCADO_PAGO_ENABLED: false,
    });
  });

  it.each([
    ['PORT', '0'], ['PORT', '65536'], ['PORT', '1.5'],
    ['AUTH_ACCESS_TTL_SECONDS', '59'], ['AUTH_ACCESS_TTL_SECONDS', '901'],
    ['AUTH_IDLE_TTL_SECONDS', '899'], ['AUTH_ABSOLUTE_TTL_SECONDS', '7776001'],
    ['AUTH_RETENTION_DAYS', '0'], ['AUTH_RETENTION_DAYS', '366'],
    ['AUTH_JWT_SECRET', 'invalid'], ['AUTH_CSRF_SECRET', 'invalid'],
    ['NOTIFICATION_ENCRYPTION_KEY', 'invalid'],
    ['QUOTE_SHARE_RATE_LIMIT_SECRET', 'invalid'],
    ['STRIPE_SECRET_KEY', 'invalid'], ['STRIPE_WEBHOOK_SECRET', 'invalid'],
    ['STRIPE_PORTAL_CONFIGURATION_ID', 'invalid'],
    ['AUTH_GOOGLE_CLIENT_ID', 'invalid'],
    ['DATABASE_URL', 'https://example.invalid'],
    ['STORAGE_S3_ENDPOINT', 'ftp://example.invalid'],
    ['MAIL_FROM_EMAIL', 'invalid'], ['MAIL_FROM_NAME', '<invalid>'],
    ['STORAGE_BUCKET', 'ab'], ['STORAGE_PRIVATE_BUCKET', base.STORAGE_BUCKET],
    ['RESEND_TEMPLATE_VERIFY_EMAIL', 'invalid template'],
    ['TRUST_PROXY', 'example.invalid'],
  ])('rejects invalid %s', (field, value) => {
    expect(() => validateEnvironment({ ...base, [field]: value })).toThrow(field);
  });

  it('accepts bounded numeric strings and trusted IP addresses', () => {
    expect(validateEnvironment({
      ...base, PORT: '65535', AUTH_ACCESS_TTL_SECONDS: '60',
      AUTH_IDLE_TTL_SECONDS: '900', AUTH_ABSOLUTE_TTL_SECONDS: '900',
      TRUST_PROXY: '127.0.0.1, 10.0.0.0/8, ::1',
    })).toMatchObject({
      PORT: 65535, AUTH_ACCESS_TTL_SECONDS: 60,
      AUTH_IDLE_TTL_SECONDS: 900, AUTH_ABSOLUTE_TTL_SECONDS: 900,
    });
  });

  it('reports invalid field names without exposing secret values', () => {
    expect(() => validateEnvironment({
      ...base, AUTH_JWT_SECRET: 'private-fixture-secret', PORT: '-1',
    })).toThrow(/AUTH_JWT_SECRET|PORT/);
    try {
      validateEnvironment({ ...base, AUTH_JWT_SECRET: 'private-fixture-secret', PORT: '-1' });
      throw new Error('unexpected validation success');
    } catch (error) {
      expect(String(error)).not.toContain('private-fixture-secret');
      expect(String(error)).toContain('AUTH_JWT_SECRET');
      expect(String(error)).toContain('PORT');
    }
  });

  it('rejects idle sessions that outlive their absolute lifetime', () => {
    expect(() => validateEnvironment({
      ...base, AUTH_IDLE_TTL_SECONDS: '1800', AUTH_ABSOLUTE_TTL_SECONDS: '900',
    })).toThrow('AUTH_IDLE_TTL_SECONDS must not exceed');
  });

  it('rejects reused authentication secrets regardless of letter case', () => {
    expect(() => validateEnvironment({
      ...base, AUTH_JWT_SECRET: 'a'.repeat(64), AUTH_CSRF_SECRET: 'A'.repeat(64),
    })).toThrow('must be different');
  });

  it.each(['AUTH_JWT_SECRET', 'AUTH_CSRF_SECRET', 'NOTIFICATION_ENCRYPTION_KEY', 'QUOTE_SHARE_RATE_LIMIT_SECRET'] as const)(
    'requires independent receiving settings encryption from %s', (key) => {
      expect(() => validateEnvironment({
        ...base, RECEIVING_SETTINGS_ENCRYPTION_KEY: base[key],
      })).toThrow('RECEIVING_SETTINGS_ENCRYPTION_KEY must be independent');
    },
  );

  it.each(['AUTH_JWT_SECRET', 'AUTH_CSRF_SECRET', 'NOTIFICATION_ENCRYPTION_KEY', 'QUOTE_SHARE_RATE_LIMIT_SECRET'] as const)(
    'requires independent Mercado Pago encryption from %s', (key) => {
      expect(() => validateEnvironment({
        ...base, MERCADO_PAGO_ENCRYPTION_KEY: base[key],
      })).toThrow('MERCADO_PAGO_ENCRYPTION_KEY must be independent');
    },
  );

  it.each([
    'https://user:password@example.invalid',
    'https://example.invalid/path',
    'https://example.invalid?query=1',
    'https://example.invalid/#fragment',
  ])('rejects frontend URLs that are not origins', (url) => {
    expect(() => validateEnvironment({ ...base, FRONTEND_URL: url })).toThrow('FRONTEND_URL must contain only an origin');
  });

  it('allows HTTP for local development but requires HTTPS in production', () => {
    const FRONTEND_URL = 'http://localhost:3000';
    expect(validateEnvironment({ ...base, NODE_ENV: 'development', FRONTEND_URL }).FRONTEND_URL).toBe(FRONTEND_URL);
    expect(() => validateEnvironment({ ...base, FRONTEND_URL })).toThrow('FRONTEND_URL must use HTTPS');
  });

  it.each([
    [{ MERCADO_PAGO_SANDBOX_PIX_ENABLED: 'true' }, 'Sandbox Pix requires'],
    [{ MERCADO_PAGO_WEBHOOK_ENABLED: 'true', MERCADO_PAGO_WEBHOOK_SECRET: 'fixture-webhook-secret' }, 'webhook intake requires'],
    [{ MERCADO_PAGO_WEBHOOK_WORKER_ENABLED: 'true' }, 'webhook worker requires'],
    [{ MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: 'true', MERCADO_PAGO_LIVE_WEBHOOK_SECRET: 'fixture-live-secret' }, 'live webhook intake requires'],
    [{ MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: 'true' }, 'live webhook worker requires'],
  ] as const)('rejects unsafe payment feature combinations', (patch, message) => {
    expect(() => validateEnvironment({ ...base, ...patch })).toThrow(message);
  });
});
