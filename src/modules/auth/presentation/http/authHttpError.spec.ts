import { describe, expect, it } from 'vitest';

import { AuthError } from '../../domain/errors/auth.error.js';
import { authOperation, toAuthHttpError } from './authHttpError.js';

describe('auth HTTP error contracts', () => {
  it.each([
    ['INVALID_CREDENTIALS', 401],
    ['EMAIL_NOT_VERIFIED', 403],
    ['INVALID_PASSWORD', 400],
    ['PLAN_UNAVAILABLE', 400],
    ['INVALID_GOOGLE_CREDENTIAL', 401],
    ['GOOGLE_EMAIL_NOT_VERIFIED', 403],
    ['GOOGLE_ACCOUNT_LINK_REQUIRED', 409],
    ['GOOGLE_EMAIL_MISMATCH', 409],
    ['GOOGLE_IDENTITY_IN_USE', 409],
    ['GOOGLE_PROVIDER_ALREADY_LINKED', 409],
    ['GOOGLE_IDENTITY_CONFLICT', 409],
    ['TERMS_ACCEPTANCE_REQUIRED', 412],
    ['LEGAL_DOCUMENT_VERSION_OUTDATED', 409],
  ] as const)('maps %s to HTTP %i', (code, status) => {
    expect(toAuthHttpError(new AuthError(code))).toMatchObject({
      status,
      publicError: { code, details: [] },
    });
  });

  it.each(['INVALID_SESSION', 'INVALID_TOKEN', 'TOKEN_REUSED'] as const)(
    'returns the same public authentication failure for %s',
    (code) => {
      expect(toAuthHttpError(new AuthError(code))).toMatchObject({
        status: 401,
        publicError: {
          code: 'INVALID_SESSION',
          message: 'Authentication is invalid or expired.',
          details: [],
        },
      });
    },
  );

  it('preserves successful results', async () => {
    const value = { id: 'fixture' };

    await expect(authOperation(async () => value)).resolves.toBe(value);
  });

  it('propagates unexpected exceptions unchanged', async () => {
    const failure = new Error('unexpected');

    await expect(authOperation(() => Promise.reject(failure))).rejects.toBe(failure);
  });

  it('translates domain errors rejected by an operation', async () => {
    await expect(authOperation(() => Promise.reject(new AuthError('INVALID_TOKEN')))).rejects.toMatchObject({
      status: 401,
      publicError: { code: 'INVALID_SESSION' },
    });
  });
});
