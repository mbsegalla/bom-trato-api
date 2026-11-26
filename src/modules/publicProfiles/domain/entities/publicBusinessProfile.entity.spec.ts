import { describe, expect, it } from 'vitest';

import { PublicBusinessProfile } from './publicBusinessProfile.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  id: 'profile',
  organizationId: 'org',
  slug: ' empresa ',
  headline: null,
  description: null,
  whatsappPhone: null,
  whatsappEnabled: false,
  published: false,
  serviceIds: ['a', 'a'],
};

describe('PublicBusinessProfile', () => {
  it('normalizes public slug and deduplicates selected services', () => {
    expect(PublicBusinessProfile.slugFromName('  Manutenção & Serviços  ')).toBe('manutencao-servicos');
    expect(PublicBusinessProfile.create(input, now).snapshot()).toMatchObject({
      slug: 'empresa',
      serviceIds: ['a'],
      publishedAt: null,
    });
  });

  it('requires a valid enabled contact before publication', () => {
    expect(() => PublicBusinessProfile.create({ ...input, published: true }, now)).toThrow(
      'PUBLIC_PROFILE_CONTACT_REQUIRED',
    );
    expect(() => PublicBusinessProfile.create({ ...input, whatsappEnabled: true }, now)).toThrow(
      'PUBLIC_PROFILE_CONTACT_REQUIRED',
    );
    expect(() => PublicBusinessProfile.create({ ...input, slug: '../unsafe' }, now)).toThrow(
      'INVALID_PUBLIC_PROFILE_SLUG',
    );
  });

  it('caps the number of distinct published services', () => {
    expect(() =>
      PublicBusinessProfile.create(
        {
          ...input,
          serviceIds: Array.from({ length: 21 }, (_, i) => String(i)),
        },
        now,
      ),
    ).toThrow('PUBLIC_PROFILE_TOO_MANY_SERVICES');
  });
});
