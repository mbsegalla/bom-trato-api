import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../test/support/asymmetricMatchers.js';

const sink = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
}));
const createLogger = vi.hoisted(() => vi.fn(() => sink));
vi.mock('pino', () => ({ default: createLogger }));

import { runWithRequestLogContext, setAuthenticatedLogUser } from './requestLogContext.js';
import { StructuredLogger } from './structuredLogger.js';

describe('StructuredLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses production logging without pretty transport and defaults to info', () => {
    new StructuredLogger();
    expect(createLogger).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        level: 'info',
        transport: undefined,
        base: { service: 'bom-trato-api', environment: 'production' },
      }),
    );
  });

  it('uses the configured level and pretty transport in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', ' warn ');
    new StructuredLogger();
    expect(createLogger).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        level: 'warn',
        transport: asymmetric.objectContaining({ target: 'pino-pretty' }),
      }),
    );
  });

  it('defaults to debug outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    new StructuredLogger();
    expect(createLogger).toHaveBeenCalledWith(asymmetric.objectContaining({ level: 'debug' }));
  });

  it.each([
    ['log', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
    ['verbose', 'trace'],
    ['fatal', 'fatal'],
  ] as const)('dispatches %s to the correct logger level', (method, level) => {
    new StructuredLogger('default')[method]('fixture message', 'explicit');
    expect(sink[level]).toHaveBeenCalledWith({ context: 'explicit' }, 'fixture message');
  });

  it('filters credentials, non-finite numbers and nested objects while preserving safe scalar fields', () => {
    new StructuredLogger('default').log({
      message: 'processed',
      count: 2,
      success: true,
      label: ' fixture ',
      password: 'private',
      accessToken: 'private',
      api_key: 'private',
      authorization: 'private',
      invalid: Infinity,
      nested: { value: 'private' },
      empty: '   ',
    });
    expect(sink.info).toHaveBeenCalledWith(
      {
        count: 2,
        success: true,
        label: 'fixture',
        context: 'default',
      },
      'processed',
    );
  });

  it('adds request and authenticated user context', () => {
    const logger = new StructuredLogger();
    runWithRequestLogContext('request', () => {
      setAuthenticatedLogUser('user');
      logger.log({ message: 'done', requestId: 'untrusted' });
    });

    expect(sink.info).toHaveBeenCalledWith({ requestId: 'request', userId: 'user' }, 'done');
  });

  it('sanitizes error messages and cause fields without exposing credentials', () => {
    const error = Object.assign(new Error('password=private-value'), {
      code: 'ETIMEDOUT',
      cause: { message: 'token=private-token', statusCode: 503 },
    });
    new StructuredLogger().error(error);
    expect(sink.error).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        errorCode: 'ETIMEDOUT',
        errorMessage: 'password=[REDACTED]',
        causeMessage: 'token=[REDACTED]',
        upstreamStatus: 503,
      }),
      'Error: password=[REDACTED]',
    );
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain('private-value');
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain('private-token');
  });

  it.each([null, undefined, 123, {}, '', '   '])('uses a fallback for invalid messages %j', (message) => {
    new StructuredLogger().log(message);
    expect(sink.info).toHaveBeenCalledWith({}, 'Application log');
  });
});
