import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { PublicBusinessProfile } from '../../../src/modules/publicProfiles/domain/entities/publicBusinessProfile.entity.js';
import { PrismaPublicProfileRepository } from '../../../src/modules/publicProfiles/infrastructure/repositories/prismaPublicProfile.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('public professional directory (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture(marker = randomUUID()) {
    const actor = await db.tenant();
    const now = new Date();

    await db.prisma.organization.update({
      where: { id: actor.organizationId },
      data: { name: 'Fixture ' + marker, city: 'Uberlândia', state: 'MG' },
    });

    const service = await db.prisma.catalogService.create({
      data: { organizationId: actor.organizationId, name: 'Instalação ' + marker, amountInCents: 1000 },
    });
    db.cleanup(() => db.prisma.catalogService.deleteMany({ where: { id: service.id } }));
    db.cleanup(() => db.prisma.publicBusinessProfile.deleteMany({ where: { organizationId: actor.organizationId } }));

    const profile = PublicBusinessProfile.create({
      id: randomUUID(),
      organizationId: actor.organizationId,
      slug: 'fixture-' + actor.organizationId,
      headline: null,
      description: null,
      whatsappPhone: '34999991234',
      whatsappEnabled: true,
      published: true,
      serviceIds: [service.id],
    }, now);
    const repository = new PrismaPublicProfileRepository(db.prisma);
    await repository.save(profile);

    return { actor, service, profile, repository, marker };
  }

  it('searches accents literally and preserves ranked pagination without exposing contact or internal identifiers', async () => {
    const marker = randomUUID();
    const first = await fixture(marker);
    const second = await fixture(marker);

    await db.prisma.publicBusinessProfile.update({
      where: { organizationId: first.actor.organizationId }, data: { ratingSum: 5, ratingCount: 1, reputationScore: 5000 },
    });
    const params = { page: 1, limit: 1, search: '  instalacao ' + marker + '  ', city: 'uberlandia', state: 'mg' };
    const firstPage = await first.repository.listPublished(params);
    const secondPage = await first.repository.listPublished({ ...params, page: 2 });

    expect(firstPage).toMatchObject({
      page: 1, hasMore: true,
      items: [{ slug: first.profile.snapshot().slug, ratingAverage: 5, ratingCount: 1, whatsappAvailable: true }],
    });
    expect(secondPage).toMatchObject({
      page: 2, hasMore: false, items: [{ slug: second.profile.snapshot().slug, ratingAverage: null }],
    });
    expect(firstPage.items[0]).not.toHaveProperty('whatsappPhone');
    expect(firstPage.items[0]).not.toHaveProperty('organizationId');
    expect(firstPage.items[0]?.organization).not.toHaveProperty('ownerId');
    expect((await first.repository.listPublished({ ...params, search: '%' + marker })).items).toEqual([]);
  });

  it('filters archived catalog services and profiles that are not publicly eligible', async () => {
    const f = await fixture();
    const slug = f.profile.snapshot().slug;

    expect(await f.repository.findPublishedBySlug(slug)).toMatchObject({
      services: [{ id: f.service.id, name: f.service.name }],
    });
    expect(await f.repository.findWhatsappContact(slug)).toEqual({ businessName: 'Fixture ' + f.marker, phone: '34999991234' });

    await db.prisma.catalogService.update({ where: { id: f.service.id }, data: { archivedAt: new Date() } });
    expect(await f.repository.findPublishedBySlug(slug)).toMatchObject({ services: [] });
    expect((await f.repository.listPublished({ page: 1, limit: 10, search: 'instalacao ' + f.marker })).items).toEqual([]);

    await db.prisma.organization.update({ where: { id: f.actor.organizationId }, data: { city: null } });
    expect(await f.repository.findPublishedBySlug(slug)).toBeNull();
    expect(await f.repository.findWhatsappContact(slug)).toBeNull();

    await db.prisma.organization.update({ where: { id: f.actor.organizationId }, data: { city: 'Uberlândia' } });
    await db.prisma.publicBusinessProfile.update({ where: { organizationId: f.actor.organizationId }, data: { published: false } });
    expect(await f.repository.findPublishedBySlug(slug)).toBeNull();
  });

  it('rejects foreign and archived service selections without overwriting valid profile settings', async () => {
    const f = await fixture();
    const other = await fixture();
    const original = f.profile.snapshot();

    for (const serviceId of [other.service.id, randomUUID()]) {
      const changed = PublicBusinessProfile.restore({ ...original, serviceIds: [serviceId] });

      await expect(f.repository.save(changed)).rejects.toThrow('PUBLIC_PROFILE_SERVICE_NOT_FOUND');
    }

    expect(await f.repository.findByOrganizationId(f.actor.organizationId)).toMatchObject({ serviceIds: [f.service.id] });

    const duplicate = PublicBusinessProfile.restore({ ...original, slug: other.profile.snapshot().slug });
    await expect(f.repository.save(duplicate)).rejects.toThrow('PUBLIC_PROFILE_SLUG_TAKEN');

    expect(await f.repository.suggestAvailableSlug(original.slug, f.actor.organizationId)).toBe(original.slug);
    expect(await f.repository.suggestAvailableSlug(original.slug, other.actor.organizationId))
      .toBe(original.slug + '-' + other.actor.organizationId.replaceAll('-', '').slice(0, 10));
  });
});
