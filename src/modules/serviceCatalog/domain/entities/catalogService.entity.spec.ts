import { describe, expect, it } from 'vitest';

import { CatalogService } from './catalogService.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  id: 'service',
  organizationId: 'org',
  name: ' Revisao ',
  unit: 'SERVICE' as const,
  amountInCents: 1000,
};

describe('CatalogService', () => {
  it.each([-1, 0.1, 2147483648, NaN])('rejects invalid integer cent amount %s', (amountInCents) => {
    expect(() => CatalogService.create({ ...input, amountInCents }, now)).toThrow('INVALID_CATALOG_SERVICE_AMOUNT');
  });

  it('accepts free services but rejects invalid duration', () => {
    expect(CatalogService.create({ ...input, amountInCents: 0 }, now).snapshot()).toMatchObject({
      name: 'Revisao',
      currency: 'brl',
      amountInCents: 0,
    });
    expect(() =>
      CatalogService.create(
        {
          ...input,
          estimatedDurationMinutes: 0,
        },
        now,
      ),
    ).toThrow('INVALID_CATALOG_SERVICE_DURATION');
  });

  it('prevents edits while archived and supports restoring the service', () => {
    const service = CatalogService.create(input, now);
    service.archive(now);

    expect(() => service.update({ amountInCents: 2000 }, now)).toThrow('CATALOG_SERVICE_ARCHIVED');

    service.unarchive(now);
    service.update({ amountInCents: 2000 }, now);

    expect(service.snapshot().amountInCents).toBe(2000);
  });
});
