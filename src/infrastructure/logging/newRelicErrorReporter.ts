import { createRequire } from 'node:module';

import { requestLogContext } from './requestLogContext.js';
import { safeError } from './safeError.js';

type NewRelicAttributeValue = boolean | number | string;

interface NewRelicApi {
  noticeError(error: Error, customAttributes?: Record<string, NewRelicAttributeValue>): void;
}

const require = createRequire(import.meta.url);

let newRelicApi: NewRelicApi | undefined;

function getNewRelicApi(): NewRelicApi | undefined {
  if (process.env.NEW_RELIC_ENABLED !== 'true') {
    return undefined;
  }

  newRelicApi ??= require('newrelic') as NewRelicApi;

  return newRelicApi;
}

function compactAttributes(
  values: Record<string, NewRelicAttributeValue | undefined>,
): Record<string, NewRelicAttributeValue> {
  const attributes: Record<string, NewRelicAttributeValue> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function sanitizedError(error: unknown): Error {
  const details = safeError(error);

  const errorName = details.errorName ?? 'Error';
  const errorMessage = details.errorMessage ?? details.errorCode;

  const sanitized = new Error(errorMessage);

  sanitized.name = errorName;

  if (details.errorStack !== undefined) {
    sanitized.stack = details.errorStack;
  }

  return sanitized;
}

export function reportNewRelicError(
  error: unknown,
  additionalAttributes: Record<string, NewRelicAttributeValue | undefined> = {},
): void {
  const newrelic = getNewRelicApi();

  if (!newrelic) {
    return;
  }

  const errorDetails = safeError(error);

  newrelic.noticeError(
    sanitizedError(error),
    compactAttributes({
      ...requestLogContext(),
      errorCode: errorDetails.errorCode,
      causeCode: errorDetails.causeCode,
      upstreamStatus: errorDetails.upstreamStatus,
      ...additionalAttributes,
    }),
  );
}
