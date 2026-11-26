import { afterEach, describe, expect, it, vi } from 'vitest';

import { readJsonObject } from '../../../test/support/testJson.js';
import { appConfig } from '../app.config.js';
import { authConfig } from '../auth.config.js';
import { databaseConfig } from '../database.config.js';
import { mercadoPagoConfig } from '../mercadoPago.config.js';
import { mercadoPagoLiveWebhookConfig } from '../mercadoPagoLiveWebhook.config.js';
import { mercadoPagoWebhookConfig } from '../mercadoPagoWebhook.config.js';
import { notificationConfig } from '../notification.config.js';
import { quoteShareConfig } from '../quoteShare.config.js';
import { receivingSettingsConfig } from '../receivingSettings.config.js';
import { storageConfig } from '../storage.config.js';
import { stripeConfig } from '../stripe.config.js';

import { envValidationSchema, validateEnvironment } from './env.validation.js';

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
  ...Object.fromEntries(
    [
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
    ].map((name) => ['RESEND_TEMPLATE_' + name, 'fixture-template']),
  ),
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
    expect(
      validateEnvironment({
        ...approved,
        MERCADO_PAGO_LIVE_PIX_ENABLED: 'false',
        MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'false',
      }),
    ).toMatchObject({
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
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '1.5'],
    ['AUTH_ACCESS_TTL_SECONDS', '59'],
    ['AUTH_ACCESS_TTL_SECONDS', '901'],
    ['AUTH_IDLE_TTL_SECONDS', '899'],
    ['AUTH_ABSOLUTE_TTL_SECONDS', '7776001'],
    ['AUTH_RETENTION_DAYS', '0'],
    ['AUTH_RETENTION_DAYS', '366'],
    ['AUTH_JWT_SECRET', 'invalid'],
    ['AUTH_CSRF_SECRET', 'invalid'],
    ['NOTIFICATION_ENCRYPTION_KEY', 'invalid'],
    ['QUOTE_SHARE_RATE_LIMIT_SECRET', 'invalid'],
    ['STRIPE_SECRET_KEY', 'invalid'],
    ['STRIPE_WEBHOOK_SECRET', 'invalid'],
    ['STRIPE_PORTAL_CONFIGURATION_ID', 'invalid'],
    ['AUTH_GOOGLE_CLIENT_ID', 'invalid'],
    ['DATABASE_URL', 'https://example.invalid'],
    ['STORAGE_S3_ENDPOINT', 'ftp://example.invalid'],
    ['MAIL_FROM_EMAIL', 'invalid'],
    ['MAIL_FROM_NAME', '<invalid>'],
    ['STORAGE_BUCKET', 'ab'],
    ['STORAGE_PRIVATE_BUCKET', base.STORAGE_BUCKET],
    ['RESEND_TEMPLATE_VERIFY_EMAIL', 'invalid template'],
    ['TRUST_PROXY', 'example.invalid'],
  ])('rejects invalid %s', (field, value) => {
    expect(() => validateEnvironment({ ...base, [field]: value })).toThrow(field);
  });

  it('accepts bounded numeric strings and trusted IP addresses', () => {
    expect(
      validateEnvironment({
        ...base,
        PORT: '65535',
        AUTH_ACCESS_TTL_SECONDS: '60',
        AUTH_IDLE_TTL_SECONDS: '900',
        AUTH_ABSOLUTE_TTL_SECONDS: '900',
        TRUST_PROXY: '127.0.0.1, 10.0.0.0/8, ::1',
      }),
    ).toMatchObject({
      PORT: 65535,
      AUTH_ACCESS_TTL_SECONDS: 60,
      AUTH_IDLE_TTL_SECONDS: 900,
      AUTH_ABSOLUTE_TTL_SECONDS: 900,
    });
  });

  it('reports invalid field names without exposing secret values', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        AUTH_JWT_SECRET: 'private-fixture-secret',
        PORT: '-1',
      }),
    ).toThrow(/AUTH_JWT_SECRET|PORT/);
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
    expect(() =>
      validateEnvironment({
        ...base,
        AUTH_IDLE_TTL_SECONDS: '1800',
        AUTH_ABSOLUTE_TTL_SECONDS: '900',
      }),
    ).toThrow('AUTH_IDLE_TTL_SECONDS must not exceed');
  });

  it('rejects reused authentication secrets regardless of letter case', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        AUTH_JWT_SECRET: 'a'.repeat(64),
        AUTH_CSRF_SECRET: 'A'.repeat(64),
      }),
    ).toThrow('must be different');
  });

  it.each([
    'AUTH_JWT_SECRET',
    'AUTH_CSRF_SECRET',
    'NOTIFICATION_ENCRYPTION_KEY',
    'QUOTE_SHARE_RATE_LIMIT_SECRET',
  ] as const)('requires independent receiving settings encryption from %s', (key) => {
    expect(() =>
      validateEnvironment({
        ...base,
        RECEIVING_SETTINGS_ENCRYPTION_KEY: base[key],
      }),
    ).toThrow('RECEIVING_SETTINGS_ENCRYPTION_KEY must be independent');
  });

  it.each([
    'AUTH_JWT_SECRET',
    'AUTH_CSRF_SECRET',
    'NOTIFICATION_ENCRYPTION_KEY',
    'QUOTE_SHARE_RATE_LIMIT_SECRET',
  ] as const)('requires independent Mercado Pago encryption from %s', (key) => {
    expect(() =>
      validateEnvironment({
        ...base,
        MERCADO_PAGO_ENCRYPTION_KEY: base[key],
      }),
    ).toThrow('MERCADO_PAGO_ENCRYPTION_KEY must be independent');
  });

  it.each([
    'https://user:password@example.invalid',
    'https://example.invalid/path',
    'https://example.invalid?query=1',
    'https://example.invalid/#fragment',
  ])('rejects frontend URLs that are not origins', (url) => {
    expect(() => validateEnvironment({ ...base, FRONTEND_URL: url })).toThrow(
      'FRONTEND_URL must contain only an origin',
    );
  });

  it('allows HTTP for local development but requires HTTPS in production', () => {
    const FRONTEND_URL = 'http://localhost:3000';
    expect(validateEnvironment({ ...base, NODE_ENV: 'development', FRONTEND_URL }).FRONTEND_URL).toBe(FRONTEND_URL);
    expect(() => validateEnvironment({ ...base, FRONTEND_URL })).toThrow('FRONTEND_URL must use HTTPS');
  });

  it.each([
    [{ MERCADO_PAGO_SANDBOX_PIX_ENABLED: 'true' }, 'Sandbox Pix requires'],
    [
      { MERCADO_PAGO_WEBHOOK_ENABLED: 'true', MERCADO_PAGO_WEBHOOK_SECRET: 'fixture-webhook-secret' },
      'webhook intake requires',
    ],
    [{ MERCADO_PAGO_WEBHOOK_WORKER_ENABLED: 'true' }, 'webhook worker requires'],
    [
      { MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: 'true', MERCADO_PAGO_LIVE_WEBHOOK_SECRET: 'fixture-live-secret' },
      'live webhook intake requires',
    ],
    [{ MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: 'true' }, 'live webhook worker requires'],
  ] as const)('rejects unsafe payment feature combinations', (patch, message) => {
    expect(() => validateEnvironment({ ...base, ...patch })).toThrow(message);
  });
});

describe('configuration factories with validated environment', () => {
  function configure(overrides: Record<string, string | undefined> = {}) {
    // Isolate all schema-managed values from CI/developer environment variables.
    const values: Record<string, string | undefined> = { ...base, ...overrides };
    const description: unknown = envValidationSchema.describe();
    const keys = readJsonObject(description).keys;
    for (const key of Object.keys(readJsonObject(keys ?? {}))) {
      vi.stubEnv(key, values[key]);
    }
  }

  afterEach(() => vi.unstubAllEnvs());

  it('maps application origin, worker flags, port and explicit trusted proxies', () => {
    configure({
      PORT: '4321',
      TRUST_PROXY: '127.0.0.1, 10.0.0.0/8, ::1',
      FRONTEND_URL: 'https://web.example.invalid/',
      WORK_ORDER_RECURRENCE_WORKER_ENABLED: 'false',
      WORK_ORDER_RECURRENCE_REMINDER_WORKER_ENABLED: 'true',
    });
    expect(appConfig()).toMatchObject({
      port: 4321,
      trustProxy: ['127.0.0.1', '10.0.0.0/8', '::1'],
      frontendUrl: 'https://web.example.invalid',
      workOrderRecurrenceWorkerEnabled: false,
      workOrderRecurrenceReminderWorkerEnabled: true,
      isProduction: true,
      swaggerEnabled: false,
    });
  });

  it('uses development settings without trusted proxies by default', () => {
    configure({ NODE_ENV: 'development', FRONTEND_URL: 'http://localhost:3000' });
    expect(appConfig()).toMatchObject({
      trustProxy: [],
      isProduction: false,
      swaggerEnabled: true,
      frontendUrl: 'http://localhost:3000',
    });
  });

  it('maps authentication settings and action token TTLs without mixing independent secrets', () => {
    configure({
      AUTH_ACCESS_TTL_SECONDS: '300',
      AUTH_IDLE_TTL_SECONDS: '3600',
      AUTH_ABSOLUTE_TTL_SECONDS: '7200',
      AUTH_RETENTION_DAYS: '90',
      AUTH_CLEANUP_WORKER_ENABLED: 'false',
      AUTH_JWT_ISSUER: 'fixture-issuer',
      AUTH_JWT_AUDIENCE: 'fixture-audience',
    });
    expect(authConfig()).toEqual({
      jwtSecret: base.AUTH_JWT_SECRET,
      csrfSecret: base.AUTH_CSRF_SECRET,
      issuer: 'fixture-issuer',
      audience: 'fixture-audience',
      accessTtlSeconds: 300,
      idleTtlSeconds: 3600,
      absoluteTtlSeconds: 7200,
      retentionDays: 90,
      cleanupWorkerEnabled: false,
      googleClientId: base.AUTH_GOOGLE_CLIENT_ID,
      verificationTtlSeconds: 86400,
      resetTtlSeconds: 1800,
    });
  });

  it('maps the database, Stripe and quote-sharing settings independently', () => {
    configure({
      STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_fixture',
      BILLING_WORKER_ENABLED: 'false',
      QUOTE_SHARE_CLEANUP_WORKER_ENABLED: 'false',
    });
    expect(databaseConfig()).toEqual({ url: base.DATABASE_URL });
    expect(stripeConfig()).toEqual({
      secretKey: base.STRIPE_SECRET_KEY,
      webhookSecret: base.STRIPE_WEBHOOK_SECRET,
      portalConfigurationId: 'bpc_fixture',
      workerEnabled: false,
    });
    expect(quoteShareConfig()).toEqual({
      rateLimitSecret: base.QUOTE_SHARE_RATE_LIMIT_SECRET,
      cleanupWorkerEnabled: false,
    });
  });

  it('preserves notification template identities and the sender address', () => {
    configure({
      NOTIFICATION_WORKER_ENABLED: 'false',
      TRIAL_LIFECYCLE_WORKER_ENABLED: 'true',
      ...Object.fromEntries(
        Object.keys(base)
          .filter((key) => key.startsWith('RESEND_TEMPLATE_'))
          .map((key) => [key, 'fixture-' + key.slice(16).toLowerCase()]),
      ),
    });
    const config = notificationConfig();
    expect(config).toMatchObject({
      apiKey: base.RESEND_API_KEY,
      encryptionKey: base.NOTIFICATION_ENCRYPTION_KEY,
      from: 'Fixture <fixture@example.invalid>',
      workerEnabled: false,
      trialLifecycleEnabled: true,
    });
    expect(config.templates).toEqual(
      Object.fromEntries(
        Object.keys(base)
          .filter((key) => key.startsWith('RESEND_TEMPLATE_'))
          .map((key) => [key.slice(16), 'fixture-' + key.slice(16).toLowerCase()]),
      ),
    );
  });

  it.each([undefined, 'private-fixture-bucket'])(
    'normalizes the public storage URL and preserves the private bucket boundary',
    (bucket) => {
      configure({ STORAGE_PRIVATE_BUCKET: bucket, STORAGE_PUBLIC_BASE_URL: 'https://assets.example.invalid///' });
      expect(storageConfig()).toEqual({
        endpoint: base.STORAGE_S3_ENDPOINT,
        region: 'auto',
        accessKeyId: base.STORAGE_S3_ACCESS_KEY_ID,
        secretAccessKey: base.STORAGE_S3_SECRET_ACCESS_KEY,
        bucket: base.STORAGE_BUCKET,
        privateBucket: bucket ?? null,
        publicBaseUrl: 'https://assets.example.invalid',
      });
    },
  );

  it.each([undefined, '6'.repeat(64)])(
    'does not substitute another secret for the receiving settings encryption key',
    (key) => {
      configure({ RECEIVING_SETTINGS_ENCRYPTION_KEY: key });
      expect(receivingSettingsConfig()).toEqual({ encryptionKey: key });
    },
  );

  it('leaves both webhook modes and payment issuance disabled by default', () => {
    configure();
    expect(mercadoPagoConfig()).toMatchObject({
      enabled: false,
      liveMode: false,
      sandboxPixEnabled: false,
      livePixEnabled: false,
      redirectUri: 'https://web.example.invalid/mercado-pago/callback',
    });
    expect(mercadoPagoWebhookConfig()).toEqual({
      enabled: false,
      workerEnabled: false,
      clientId: undefined,
      secret: undefined,
    });
    expect(mercadoPagoLiveWebhookConfig()).toEqual({
      enabled: false,
      workerEnabled: false,
      clientId: undefined,
      secret: undefined,
    });
  });

  it.each(['false', 'true'])('enables only sandbox intake and the explicitly configured worker', (worker) => {
    configure({
      MERCADO_PAGO_ENABLED: 'true',
      MERCADO_PAGO_CLIENT_ID: '123456',
      MERCADO_PAGO_CLIENT_SECRET: 'fixture-secret',
      MERCADO_PAGO_ENCRYPTION_KEY: '5'.repeat(64),
      MERCADO_PAGO_SANDBOX_PIX_ENABLED: 'true',
      MERCADO_PAGO_WEBHOOK_ENABLED: 'true',
      MERCADO_PAGO_WEBHOOK_WORKER_ENABLED: worker,
      MERCADO_PAGO_WEBHOOK_SECRET: 'fixture-sandbox-signing-secret',
    });
    expect(mercadoPagoConfig()).toMatchObject({
      enabled: true,
      liveMode: false,
      sandboxPixEnabled: true,
      livePixEnabled: false,
      clientId: '123456',
    });
    expect(mercadoPagoWebhookConfig()).toMatchObject({
      enabled: true,
      workerEnabled: worker === 'true',
      secret: 'fixture-sandbox-signing-secret',
    });
    expect(mercadoPagoLiveWebhookConfig()).toMatchObject({ enabled: false, workerEnabled: false });
  });

  it('maps the approved bounded live pilot and does not enable sandbox intake', () => {
    configure(approved);
    expect(mercadoPagoConfig()).toMatchObject({
      enabled: true,
      liveMode: true,
      sandboxPixEnabled: false,
      livePixEnabled: true,
      livePilotOrganizationId: organizationId,
      livePilotAccountId: '123456',
      livePilotMaxAmountInCents: 10000,
      clientId: '123456789',
      clientSecret: 'fixture-client-secret',
      encryptionKey: '5'.repeat(64),
    });
    expect(mercadoPagoLiveWebhookConfig()).toMatchObject({
      enabled: true,
      workerEnabled: true,
      secret: 'fixture-live-signing-secret',
    });
    expect(mercadoPagoWebhookConfig()).toMatchObject({ enabled: false, workerEnabled: false });
  });

  it('allows live webhook intake without starting its worker when new issuance is disabled', () => {
    configure({
      ...approved,
      MERCADO_PAGO_LIVE_PIX_ENABLED: 'false',
      MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: 'false',
      MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: 'false',
    });
    expect(mercadoPagoConfig()).toMatchObject({ livePixEnabled: false });
    expect(mercadoPagoLiveWebhookConfig()).toMatchObject({ enabled: true, workerEnabled: false });
  });
});
