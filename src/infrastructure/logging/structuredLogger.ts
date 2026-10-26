import type { LoggerService } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';

import { requestLogContext } from './requestLogContext.js';

type PinoLogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn';

type LogFieldValue = boolean | number | string;

const sensitiveFieldPattern =
  /(?:authorization|cookie|credential|password|secret|token|api[-_]?key|client[-_]?secret)/i;

function getLogMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }

  if (message instanceof Error) {
    return `${message.name}: application error`;
  }

  if (typeof message === 'object' && message !== null) {
    const candidate = (message as { message?: unknown }).message;

    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return 'Application log';
}

function getLogFields(message: unknown): Record<string, LogFieldValue> {
  if (typeof message !== 'object' || message === null || message instanceof Error) {
    return {};
  }

  const fields: Record<string, LogFieldValue> = {};

  for (const [key, value] of Object.entries(message)) {
    if (key === 'message' || sensitiveFieldPattern.test(key)) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      fields[key] = value;

      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      fields[key] = value;
    }
  }

  return fields;
}

export class StructuredLogger implements LoggerService {
  private readonly logger: PinoLogger;

  constructor(private readonly defaultContext?: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    this.logger = pino({
      level: process.env.LOG_LEVEL?.trim() || (isProduction ? 'info' : 'debug'),

      base: {
        service: 'bom-trato-api',
        environment: process.env.NODE_ENV || 'development',
      },

      redact: {
        paths: [
          'password',
          '*.password',
          'accessToken',
          '*.accessToken',
          'refreshToken',
          '*.refreshToken',
          'token',
          '*.token',
          'secret',
          '*.secret',
          'authorization',
          '*.authorization',
          'cookie',
          '*.cookie',
        ],
        censor: '[REDACTED]',
      },

      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname,service,environment',
            },
          },
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: PinoLogLevel, message: unknown, optionalParams: unknown[]): void {
    const lastOptionalParam = optionalParams.at(-1);

    const context = typeof lastOptionalParam === 'string' ? lastOptionalParam : this.defaultContext;

    const fields = {
      ...getLogFields(message),
      ...requestLogContext(),
      ...(context ? { context } : {}),
    };

    const text = getLogMessage(message);

    switch (level) {
      case 'fatal':
        this.logger.fatal(fields, text);
        break;

      case 'error':
        this.logger.error(fields, text);
        break;

      case 'warn':
        this.logger.warn(fields, text);
        break;

      case 'debug':
        this.logger.debug(fields, text);
        break;

      case 'trace':
        this.logger.trace(fields, text);
        break;

      default:
        this.logger.info(fields, text);
    }
  }
}
