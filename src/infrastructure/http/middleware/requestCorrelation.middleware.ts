import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { runWithRequestLogContext } from '../../logging/requestLogContext.js';

export function requestCorrelationMiddleware(_request: Request, response: Response, next: NextFunction): void {
  const requestId = randomUUID();

  response.setHeader('X-Request-Id', requestId);

  runWithRequestLogContext(requestId, () => next());
}
