export enum NodeEnvironment {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  TRUST_PROXY: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
  BILLING_WORKER_ENABLED: boolean;
  AUTH_JWT_SECRET: string;
  AUTH_CSRF_SECRET: string;
  AUTH_JWT_ISSUER: string;
  AUTH_JWT_AUDIENCE: string;
  AUTH_ACCESS_TTL_SECONDS: number;
  AUTH_IDLE_TTL_SECONDS: number;
  AUTH_ABSOLUTE_TTL_SECONDS: number;
  AUTH_RETENTION_DAYS: number;
  AUTH_CLEANUP_WORKER_ENABLED: boolean;
  AUTH_CLEANUP_INTERVAL_SECONDS: number;
  MAIL_SMTP_HOST: string;
  MAIL_SMTP_PORT: number;
  MAIL_SMTP_SECURE: boolean;
  MAIL_SMTP_USER?: string;
  MAIL_SMTP_PASSWORD?: string;
  MAIL_FROM_EMAIL: string;
  MAIL_FROM_NAME: string;
  QUOTE_SHARE_RATE_LIMIT_SECRET: string;
  QUOTE_SHARE_CLEANUP_WORKER_ENABLED: boolean;
}
