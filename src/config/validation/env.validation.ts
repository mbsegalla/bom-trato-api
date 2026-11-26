import Joi from 'joi';

import type { EnvironmentVariables } from '../types/env.types.js';
import { NodeEnvironment } from '../types/env.types.js';

const resendTemplateSchema = Joi.string()
  .trim()
  .min(1)
  .max(200)
  .pattern(/^[A-Za-z0-9_-]+$/)
  .required();

export const envValidationSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string()
    .valid(...Object.values(NodeEnvironment))
    .required(),

  PORT: Joi.number().integer().min(1).max(65535).default(5000),

  TRUST_PROXY: Joi.string()
    .trim()
    .allow('')
    .default('')
    .custom((value: string, helpers) => {
      const addresses = value.split(',').map((address) => address.trim());

      const schema = Joi.array().items(
        Joi.string().ip({
          version: ['ipv4', 'ipv6'],
          cidr: 'optional',
        }),
      );

      if (schema.validate(addresses).error !== undefined) {
        return helpers.error('any.invalid');
      }

      return value;
    }),

  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  STRIPE_SECRET_KEY: Joi.string()
    .trim()
    .pattern(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/)
    .required(),

  STRIPE_WEBHOOK_SECRET: Joi.string()
    .trim()
    .pattern(/^whsec_[A-Za-z0-9]+$/)
    .required(),

  BILLING_WORKER_ENABLED: Joi.boolean().default(true),
  WORK_ORDER_RECURRENCE_WORKER_ENABLED: Joi.boolean().default(true),
  WORK_ORDER_RECURRENCE_REMINDER_WORKER_ENABLED: Joi.boolean().default(false),

  STRIPE_PORTAL_CONFIGURATION_ID: Joi.string()
    .pattern(/^bpc_[A-Za-z0-9]+$/)
    .optional(),

  AUTH_JWT_SECRET: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),

  AUTH_CSRF_SECRET: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),

  AUTH_JWT_ISSUER: Joi.string().trim().default('bom-trato-api'),
  AUTH_JWT_AUDIENCE: Joi.string().trim().default('bom-trato-web'),
  AUTH_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(900),
  AUTH_IDLE_TTL_SECONDS: Joi.number().integer().min(900).max(2592000).default(604800),
  AUTH_ABSOLUTE_TTL_SECONDS: Joi.number().integer().min(900).max(7776000).default(2592000),
  AUTH_RETENTION_DAYS: Joi.number().integer().min(1).max(365).default(30),
  AUTH_CLEANUP_WORKER_ENABLED: Joi.boolean().default(true),

  RESEND_API_KEY: Joi.string().required(),

  NOTIFICATION_ENCRYPTION_KEY: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),

  RECEIVING_SETTINGS_ENCRYPTION_KEY: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .optional(),

  MERCADO_PAGO_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_LIVE_MODE: Joi.boolean().default(false),
  MERCADO_PAGO_SANDBOX_PIX_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_LIVE_PIX_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED: Joi.boolean().default(false),
  MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID: Joi.string()
    .pattern(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    .optional(),
  MERCADO_PAGO_LIVE_PILOT_ACCOUNT_ID: Joi.string()
    .pattern(/^[1-9]\d{0,29}$/)
    .optional(),
  MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS: Joi.number().integer().min(1).max(10000).optional(),
  MERCADO_PAGO_LIVE_WEBHOOK_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_LIVE_WEBHOOK_SECRET: Joi.string()
    .min(16)
    .max(2048)
    .pattern(/^[\x21-\x7E]+$/)
    .when('MERCADO_PAGO_LIVE_WEBHOOK_ENABLED', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  MERCADO_PAGO_WEBHOOK_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_WEBHOOK_WORKER_ENABLED: Joi.boolean().default(false),
  MERCADO_PAGO_WEBHOOK_SECRET: Joi.string()
    .min(16)
    .max(2048)
    .pattern(/^[\x21-\x7E]+$/)
    .when('MERCADO_PAGO_WEBHOOK_ENABLED', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  MERCADO_PAGO_CLIENT_ID: Joi.string()
    .pattern(/^[1-9]\d{0,29}$/)
    .when('MERCADO_PAGO_ENABLED', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  MERCADO_PAGO_CLIENT_SECRET: Joi.string()
    .max(2048)
    .pattern(/^[\x21-\x7E]+$/)
    .when('MERCADO_PAGO_ENABLED', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  MERCADO_PAGO_ENCRYPTION_KEY: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .when('MERCADO_PAGO_ENABLED', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),

  NOTIFICATION_WORKER_ENABLED: Joi.boolean().default(true),

  TRIAL_LIFECYCLE_WORKER_ENABLED: Joi.boolean().default(false),

  MAIL_FROM_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),

  MAIL_FROM_NAME: Joi.string()
    .trim()
    .max(100)
    .pattern(/^[^<>\r\n]+$/)
    .required(),

  RESEND_TEMPLATE_VERIFY_EMAIL: resendTemplateSchema,
  RESEND_TEMPLATE_RESET_PASSWORD: resendTemplateSchema,
  RESEND_TEMPLATE_PASSWORD_CHANGED: resendTemplateSchema,
  RESEND_TEMPLATE_ORGANIZATION_INVITATION: resendTemplateSchema,
  RESEND_TEMPLATE_PAYMENT_FAILED: resendTemplateSchema,
  RESEND_TEMPLATE_PAYMENT_ACTION_REQUIRED: resendTemplateSchema,
  RESEND_TEMPLATE_SUBSCRIPTION_CANCELED: resendTemplateSchema,
  RESEND_TEMPLATE_SUBSCRIPTION_ACTIVATED: resendTemplateSchema,
  RESEND_TEMPLATE_PAYMENT_CONFIRMED: resendTemplateSchema,
  RESEND_TEMPLATE_PLAN_CHANGE_CONFIRMED: resendTemplateSchema,
  RESEND_TEMPLATE_REVIEW_REQUEST: resendTemplateSchema,
  RESEND_TEMPLATE_QUOTE_FOLLOW_UP: resendTemplateSchema,
  RESEND_TEMPLATE_WORK_ORDER_REMINDER: resendTemplateSchema,
  RESEND_TEMPLATE_RECEIVABLE_DUE_SOON: resendTemplateSchema,
  RESEND_TEMPLATE_RECEIVABLE_OVERDUE: resendTemplateSchema,

  RESEND_TEMPLATE_TRIAL_LIFECYCLE: resendTemplateSchema.optional().when('TRIAL_LIFECYCLE_WORKER_ENABLED', {
    is: true,
    then: Joi.required(),
  }),

  QUOTE_SHARE_RATE_LIMIT_SECRET: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),

  QUOTE_SHARE_CLEANUP_WORKER_ENABLED: Joi.boolean().default(true),

  STORAGE_S3_ENDPOINT: Joi.string()
    .uri({
      scheme: ['http', 'https'],
    })
    .required(),

  STORAGE_S3_REGION: Joi.string().trim().default('auto'),
  STORAGE_S3_ACCESS_KEY_ID: Joi.string().trim().min(1).required(),
  STORAGE_S3_SECRET_ACCESS_KEY: Joi.string().trim().min(1).required(),
  STORAGE_BUCKET: Joi.string().trim().min(3).max(63).required(),
  STORAGE_PRIVATE_BUCKET: Joi.string().trim().min(3).max(63).invalid(Joi.ref('STORAGE_BUCKET')).optional(),

  STORAGE_PUBLIC_BASE_URL: Joi.string()
    .uri({
      scheme: ['http', 'https'],
    })
    .required(),

  AUTH_GOOGLE_CLIENT_ID: Joi.string()
    .trim()
    .pattern(/^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/)
    .required(),
});

export function validateEnvironment(values: Record<string, unknown>): EnvironmentVariables {
  const result = envValidationSchema.validate(values, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });

  if (result.error !== undefined) {
    const fields = [...new Set(result.error.details.flatMap((detail) => detail.path.map(String)))];

    throw new Error(
      `Invalid environment configuration. Check: ${fields.join(', ') || 'related environment variables'}`,
    );
  }

  const env = result.value;

  if (env.AUTH_IDLE_TTL_SECONDS > env.AUTH_ABSOLUTE_TTL_SECONDS) {
    throw new Error('AUTH_IDLE_TTL_SECONDS must not exceed AUTH_ABSOLUTE_TTL_SECONDS');
  }

  if (env.AUTH_JWT_SECRET.toLowerCase() === env.AUTH_CSRF_SECRET.toLowerCase()) {
    throw new Error('AUTH_JWT_SECRET and AUTH_CSRF_SECRET must be different');
  }

  if (
    env.RECEIVING_SETTINGS_ENCRYPTION_KEY !== undefined &&
    [
      env.AUTH_JWT_SECRET,
      env.AUTH_CSRF_SECRET,
      env.NOTIFICATION_ENCRYPTION_KEY,
      env.QUOTE_SHARE_RATE_LIMIT_SECRET,
    ].some((key) => key.toLowerCase() === env.RECEIVING_SETTINGS_ENCRYPTION_KEY?.toLowerCase())
  ) {
    throw new Error('RECEIVING_SETTINGS_ENCRYPTION_KEY must be independent of other application secrets');
  }

  if (
    env.MERCADO_PAGO_ENCRYPTION_KEY !== undefined &&
    [
      env.AUTH_JWT_SECRET,
      env.AUTH_CSRF_SECRET,
      env.NOTIFICATION_ENCRYPTION_KEY,
      env.QUOTE_SHARE_RATE_LIMIT_SECRET,
      env.RECEIVING_SETTINGS_ENCRYPTION_KEY,
      env.MERCADO_PAGO_CLIENT_SECRET,
    ].some((key) => key?.toLowerCase() === env.MERCADO_PAGO_ENCRYPTION_KEY?.toLowerCase())
  ) {
    throw new Error('MERCADO_PAGO_ENCRYPTION_KEY must be independent of other application secrets');
  }

  // Explicit operator attestation is a release gate, not proof that external
  // homologation happened. Never default any production switch to true.
  if (
    env.MERCADO_PAGO_LIVE_PIX_ENABLED &&
    (env.NODE_ENV !== NodeEnvironment.PRODUCTION ||
      !env.MERCADO_PAGO_ENABLED ||
      !env.MERCADO_PAGO_LIVE_MODE ||
      !env.MERCADO_PAGO_LIVE_WEBHOOK_ENABLED ||
      !env.MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED ||
      env.MERCADO_PAGO_LIVE_HOMOLOGATION_APPROVED !== true ||
      !env.MERCADO_PAGO_LIVE_PILOT_ORGANIZATION_ID ||
      !env.MERCADO_PAGO_LIVE_PILOT_ACCOUNT_ID ||
      env.MERCADO_PAGO_LIVE_PILOT_MAX_AMOUNT_IN_CENTS === undefined)
  ) {
    throw new Error(
      'Mercado Pago live Pix requires approved production homologation, live intake/worker and an explicit bounded organization/seller pilot',
    );
  }

  if (env.MERCADO_PAGO_SANDBOX_PIX_ENABLED && (!env.MERCADO_PAGO_ENABLED || env.MERCADO_PAGO_LIVE_MODE)) {
    throw new Error('Sandbox Pix requires enabled Mercado Pago in test mode');
  }

  if (env.MERCADO_PAGO_WEBHOOK_ENABLED && (!env.MERCADO_PAGO_ENABLED || env.MERCADO_PAGO_LIVE_MODE)) {
    throw new Error('Mercado Pago webhook intake requires enabled Mercado Pago in test mode');
  }

  if (env.MERCADO_PAGO_WEBHOOK_WORKER_ENABLED && !env.MERCADO_PAGO_WEBHOOK_ENABLED) {
    throw new Error('Mercado Pago webhook worker requires enabled webhook intake');
  }

  if (env.MERCADO_PAGO_LIVE_WEBHOOK_ENABLED && (!env.MERCADO_PAGO_ENABLED || !env.MERCADO_PAGO_LIVE_MODE)) {
    throw new Error('Mercado Pago live webhook intake requires enabled Mercado Pago in live mode');
  }

  if (env.MERCADO_PAGO_LIVE_WEBHOOK_WORKER_ENABLED && !env.MERCADO_PAGO_LIVE_WEBHOOK_ENABLED) {
    throw new Error('Mercado Pago live webhook worker requires enabled live webhook intake');
  }

  if (
    env.MERCADO_PAGO_LIVE_WEBHOOK_SECRET !== undefined &&
    (env.MERCADO_PAGO_LIVE_WEBHOOK_SECRET === env.MERCADO_PAGO_WEBHOOK_SECRET ||
      env.MERCADO_PAGO_LIVE_WEBHOOK_SECRET === env.MERCADO_PAGO_CLIENT_SECRET ||
      env.MERCADO_PAGO_LIVE_WEBHOOK_SECRET === env.MERCADO_PAGO_ENCRYPTION_KEY)
  ) {
    throw new Error('Mercado Pago live webhook secret must be independent of other configured Mercado Pago secrets');
  }

  const frontend = new URL(env.FRONTEND_URL);

  if (env.MERCADO_PAGO_ENABLED && frontend.protocol !== 'https:') {
    throw new Error('Mercado Pago OAuth requires an HTTPS FRONTEND_URL');
  }

  if (
    frontend.username ||
    frontend.password ||
    frontend.search ||
    frontend.hash ||
    (frontend.pathname !== '/' && frontend.pathname !== '')
  ) {
    throw new Error('FRONTEND_URL must contain only an origin');
  }

  if (env.NODE_ENV === NodeEnvironment.PRODUCTION && frontend.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use HTTPS in production');
  }

  return env;
}
