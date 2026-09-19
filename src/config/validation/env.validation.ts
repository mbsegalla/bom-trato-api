import Joi from 'joi';

import type { EnvironmentVariables } from '../types/env.types.js';
import { NodeEnvironment } from '../types/env.types.js';

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

  NOTIFICATION_ENCRYPTION_KEY: Joi.string().required(),

  NOTIFICATION_WORKER_ENABLED: Joi.boolean().default(true),

  MAIL_FROM_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),

  MAIL_FROM_NAME: Joi.string()
    .trim()
    .max(100)
    .pattern(/^[^<>\r\n]+$/)
    .required(),

  QUOTE_SHARE_RATE_LIMIT_SECRET: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),

  QUOTE_SHARE_CLEANUP_WORKER_ENABLED: Joi.boolean().default(true),
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

  const frontend = new URL(env.FRONTEND_URL);

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
