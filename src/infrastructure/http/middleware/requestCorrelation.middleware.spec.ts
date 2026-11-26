import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { requestLogContext, setAuthenticatedLogUser } from '../../logging/requestLogContext.js';
import { requestCorrelationMiddleware } from './requestCorrelation.middleware.js';

describe('request correlation middleware', () => {
  it('assigns a fresh request ID and exposes it only inside the request context', () => {
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const next = vi.fn(() => {
      const context = requestLogContext();
      expect(context.requestId).toEqual(expect.any(String));
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', context.requestId);
      setAuthenticatedLogUser('fixture-user');
      expect(requestLogContext().userId).toBe('fixture-user');
    });

    requestCorrelationMiddleware({} as Request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(requestLogContext()).toEqual({});
  });

  it('does not share request IDs or authenticated users between requests', () => {
    const ids: unknown[] = [];
    const response = { setHeader: vi.fn() } as unknown as Response;

    requestCorrelationMiddleware({} as Request, response, () => {
      ids.push(requestLogContext().requestId);
      setAuthenticatedLogUser('first');
    });
    requestCorrelationMiddleware({} as Request, response, () => {
      ids.push(requestLogContext().requestId);
      expect(requestLogContext().userId).toBeUndefined();
    });

    expect(new Set(ids).size).toBe(2);
  });
});
