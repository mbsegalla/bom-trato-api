import Joi from 'joi';

import type { EnvironmentVariables} from '../types/env.types.js';
import { NodeEnvironment } from '../types/env.types.js';


export const envValidationSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string()
    .valid(...Object.values(NodeEnvironment))
    .required(),

  PORT: Joi.number().integer().min(1).max(65535).default(5000),

  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
});

export function validateEnvironment(values: Record<string, unknown>): EnvironmentVariables {
  const result = envValidationSchema.validate(values, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });

  if (result.error !== undefined) {
    const messages = result.error.details
      .map((detail) => detail.message)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${messages}`);
  }

  return result.value;
}