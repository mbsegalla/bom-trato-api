import { describe, expect, it } from 'vitest';

import { PlanError } from '../../domain/errors/plan.error.js';
import { organizationOperation } from './planHttpError.js';

describe('plan HTTP contracts', () => {
  it.each(['PLAN_NOT_FOUND', 'PLAN_PRICE_NOT_FOUND'] as const)('maps %s to not found', async (code) => {
    await expect(organizationOperation(() => Promise.reject(new PlanError(code)))).rejects.toMatchObject({
      status: 404, publicError: { code },
    });
  });

  it('preserves successful operation results', async () => {
    const value = { id: 'plan' };
    await expect(organizationOperation(async () => value)).resolves.toBe(value);
  });

  it('propagates unexpected errors unchanged', async () => {
    const error = new Error('fixture failure');
    await expect(organizationOperation(() => Promise.reject(error))).rejects.toBe(error);
  });
});
