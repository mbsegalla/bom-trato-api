import { describe, expect, it } from 'vitest';

import { OrganizationError } from '../../domain/errors/organization.error.js';

import { organizationOperation } from './organizationHttpError.js';

describe('organization HTTP contracts', () => {
  it.each([
    ['INVALID_ORGANIZATION_NAME', 400],
    ['INVALID_ORGANIZATION_EMAIL', 400],
    ['INVALID_ORGANIZATION_PHONE', 400],
    ['INVALID_ORGANIZATION_DOCUMENT', 400],
    ['INVALID_ORGANIZATION_ADDRESS', 400],
    ['INVALID_ORGANIZATION_CITY', 400],
    ['INVALID_ORGANIZATION_STATE', 400],
    ['INVALID_ORGANIZATION_POSTAL_CODE', 400],
    ['INVALID_ORGANIZATION_LOGO', 400],
    ['ORGANIZATION_LOGO_REQUIRED', 400],
    ['ORGANIZATION_LOGO_TOO_LARGE', 413],
    ['ORGANIZATION_LOGO_STORAGE_FAILED', 503],
    ['EMPTY_ORGANIZATION_UPDATE', 400],
    ['IDEMPOTENCY_CONFLICT', 409],
    ['VERIFIED_USER_REQUIRED', 403],
    ['INVALID_ORGANIZATION_RECEIVABLE_DUE_DAYS', 400],
    ['INVALID_ORGANIZATION_AUTOMATION_SETTINGS', 400],
  ] as const)('maps %s to HTTP %i', async (code, status) => {
    await expect(organizationOperation(() => Promise.reject(new OrganizationError(code)))).rejects.toMatchObject({
      status,
      publicError: { code },
    });
  });

  it('preserves successful operation results', async () => {
    const result = { id: 'fixture' };
    await expect(organizationOperation(async () => result)).resolves.toBe(result);
  });

  it('propagates unexpected failures unchanged', async () => {
    const error = new Error('fixture failure');
    await expect(organizationOperation(() => Promise.reject(error))).rejects.toBe(error);
  });
});
