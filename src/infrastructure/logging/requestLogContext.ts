import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestLogContext } from './types/logging.types.js';

const storage = new AsyncLocalStorage<RequestLogContext>();

export function runWithRequestLogContext<T>(requestId: string, operation: () => T): T {
  return storage.run({ requestId }, operation);
}

export function setAuthenticatedLogUser(userId: string): void {
  const context = storage.getStore();

  if (context !== undefined) {
    context.userId = userId;
  }
}

export function requestLogContext(): Partial<RequestLogContext> {
  const context = storage.getStore();

  return context === undefined
    ? {}
    : {
        requestId: context.requestId,
        userId: context.userId,
      };
}
