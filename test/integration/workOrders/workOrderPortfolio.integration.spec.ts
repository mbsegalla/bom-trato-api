import { expect, it } from 'vitest';

import { WORK_ORDER_PORTFOLIO_CONSENT_VERSION } from '../../../src/modules/workOrders/application/types/workOrderPortfolio.types.js';
import { PrismaWorkOrderPortfolioRepository } from '../../../src/modules/workOrders/infrastructure/repositories/prismaWorkOrderPortfolio.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';
import { createWorkOrderFixture } from './support/workOrder.fixture.js';

databaseSuite('portfolio consent and public photo privacy (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const f = await createWorkOrderFixture(db);
    const repository = new PrismaWorkOrderPortfolioRepository(db.prisma);
    const before = await f.photo('BEFORE');
    const after = await f.photo('AFTER');
    const during = await f.photo('DURING');
    const hidden = await f.photo('AFTER', false);
    const params = { ...f.actor, workOrderId: f.order.id };
    const consent = {
      photoIds: [before.id],
      signerName: '  Fixture   signer  ',
      consent: true as const,
      consentVersion: WORK_ORDER_PORTFOLIO_CONSENT_VERSION,
    };

    return { ...f, repository, before, after, during, hidden, params, consent };
  }

  it('requires specific consent, publishes only the selected photo and revokes public access immediately', async () => {
    const f = await fixture();
    const repo = f.repository;

    expect(await repo.getPortalStatus(f.tokenHash)).toEqual({
      canAuthorize: true,
      photos: expect.arrayContaining([
        { id: f.before.id, consented: false, published: false },
        { id: f.after.id, consented: false, published: false },
      ]),
    });
    expect((await repo.getPortalStatus(f.tokenHash)).photos).toHaveLength(2);

    await expect(repo.publish({ ...f.params, photoId: f.before.id }, { publish: true }))
      .rejects.toThrow('PORTFOLIO_CONSENT_REQUIRED');

    await repo.consent(f.tokenHash, f.consent);

    const consented = await db.prisma.workOrderPhoto.findUniqueOrThrow({ where: { id: f.before.id } });
    expect(consented).toMatchObject({
      portfolioConsentName: 'Fixture signer',
      portfolioConsentShareId: f.share.id,
      portfolioPublishedAt: null,
    });
    expect(await repo.listPublishedForSlug(f.profile.slug)).toEqual([]);

    await repo.publish({ ...f.params, photoId: f.before.id }, { publish: true });

    expect(await repo.listPublishedForSlug(f.profile.slug)).toEqual([
      { id: f.before.id, stage: 'BEFORE', width: 800, height: 600 },
    ]);
    expect(await repo.getPublicPhotoKey(f.profile.slug, f.before.id)).toBe(f.before.objectKey);
    await expect(repo.getPublicPhotoKey(f.profile.slug, f.after.id)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');

    await repo.revoke(f.tokenHash, f.before.id);

    expect(await repo.listPublishedForSlug(f.profile.slug)).toEqual([]);
    await expect(repo.getPublicPhotoKey(f.profile.slug, f.before.id)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');

    const revoked = await db.prisma.workOrderPhoto.findUniqueOrThrow({ where: { id: f.before.id } });
    expect(revoked.portfolioRevokedAt).toBeInstanceOf(Date);
    expect(revoked.portfolioPublishedAt).toBeNull();
    expect(revoked.portfolioPublishedById).toBeNull();
  });

  it('rejects mixed selections containing hidden, during-service or foreign photos atomically', async () => {
    const f = await fixture();
    const other = await createWorkOrderFixture(db);
    const foreign = await other.photo('BEFORE');

    for (const photoId of [f.hidden.id, f.during.id, foreign.id]) {
      await expect(f.repository.consent(f.tokenHash, { ...f.consent, photoIds: [f.before.id, photoId] }))
        .rejects.toThrow('PORTFOLIO_PHOTO_NOT_FOUND');
    }

    expect(await db.prisma.workOrderPhoto.count({
      where: { id: { in: [f.before.id, f.hidden.id, f.during.id, foreign.id] }, portfolioConsentedAt: { not: null } },
    })).toBe(0);

    await expect(f.repository.publish({ ...f.params, photoId: foreign.id }, { publish: true }))
      .rejects.toThrow('PORTFOLIO_PHOTO_NOT_FOUND');
  });

  it('keeps the original consent timestamp on replay and permits explicit withdrawal of publication', async () => {
    const f = await fixture();

    await f.repository.consent(f.tokenHash, f.consent);
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true });
    const original = await db.prisma.workOrderPhoto.findUniqueOrThrow({ where: { id: f.before.id } });

    await f.repository.consent(f.tokenHash, f.consent);
    const replayed = await db.prisma.workOrderPhoto.findUniqueOrThrow({ where: { id: f.before.id } });

    expect(replayed.portfolioConsentedAt).toEqual(original.portfolioConsentedAt);
    expect(replayed.portfolioPublishedAt).toEqual(original.portfolioPublishedAt);

    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: false });

    const result = await f.repository.listForOrganization(f.params);
    expect(result.photos).toContainEqual({
      id: f.before.id, stage: 'BEFORE', visibleInPortal: true, consented: true, published: false,
    });
  });

  it('denies foreign members, uncompleted work and revoked public links', async () => {
    const f = await fixture();
    const other = await db.tenant();

    await expect(f.repository.listForOrganization({ ...f.params, userId: other.userId }))
      .rejects.toThrow('MEMBER_REQUIRED');

    await db.prisma.workOrder.update({ where: { id: f.order.id }, data: { status: 'IN_PROGRESS', completedAt: null } });

    expect((await f.repository.getPortalStatus(f.tokenHash)).canAuthorize).toBe(false);
    await expect(f.repository.consent(f.tokenHash, f.consent)).rejects.toThrow('PORTFOLIO_WORK_ORDER_NOT_COMPLETED');

    await db.prisma.workOrderShare.update({
      where: { id: f.share.id }, data: { revokedAt: new Date(), activeWorkOrderId: null },
    });
    await expect(f.repository.getPortalStatus(f.tokenHash)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
  });

  it('suppresses published photos if the public profile is unpublished or the photo is no longer visible', async () => {
    const f = await fixture();

    await f.repository.consent(f.tokenHash, f.consent);
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true });
    await db.prisma.publicBusinessProfile.update({
      where: { id: f.profile.id }, data: { published: false },
    });

    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toEqual([]);
    await expect(f.repository.getPublicPhotoKey(f.profile.slug, f.before.id)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');

    await db.prisma.publicBusinessProfile.update({
      where: { id: f.profile.id }, data: { published: true },
    });
    await db.prisma.workOrderPhoto.update({
      where: { id: f.before.id }, data: { visibleInPortal: false },
    });

    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toEqual([]);
    await expect(f.repository.getPublicPhotoKey(f.profile.slug, f.before.id)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
  });
  it.each([
    { consent: false }, { consentVersion: 'old' }, { photoIds: null }, { photoIds: [] },
    { photoIds: Array.from({ length: 21 }, (_, index) => String(index)) },
    { photoIds: ['duplicate', 'duplicate'] }, { signerName: null }, { signerName: ' ' }, { signerName: 'x'.repeat(101) },
  ])('rejects invalid consent without persisting partial authorization', async (patch) => {
    const f = await fixture();
    await expect(f.repository.consent(f.tokenHash, { ...f.consent, ...patch } as typeof f.consent))
      .rejects.toThrow('INVALID_PORTFOLIO_CONSENT');
    expect(await db.prisma.workOrderPhoto.count({
      where: { workOrderId: f.order.id, portfolioConsentedAt: { not: null } },
    })).toBe(0);
  });

  it('allows a verified member to revoke publication and consent after subscription access ends', async () => {
    const f = await fixture();
    await f.repository.consent(f.tokenHash, f.consent);
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true });
    await db.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId }, data: { revokedAt: new Date() },
    });
    await expect(f.repository.publish({ ...f.params, photoId: f.after.id }, { publish: true })).rejects.toThrow('SUBSCRIPTION_REQUIRED');
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: false });
    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toEqual([]);
    const result = await f.repository.revokeForOrganization({ ...f.params, photoId: f.before.id });
    expect(result.photos).toContainEqual({
      id: f.before.id, stage: 'BEFORE', visibleInPortal: true, consented: false, published: false,
    });
    await expect(f.repository.revokeForOrganization({ ...f.params, photoId: f.share.id })).rejects.toThrow('PORTFOLIO_PHOTO_NOT_FOUND');
  });

  it('requires renewed consent before republishing a revoked photo', async () => {
    const f = await fixture();
    await f.repository.consent(f.tokenHash, f.consent);
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true });
    await f.repository.revokeForOrganization({ ...f.params, photoId: f.before.id });
    await expect(f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true })).rejects.toThrow('PORTFOLIO_CONSENT_REQUIRED');
    await f.repository.consent(f.tokenHash, { ...f.consent, signerName: 'New signer' });
    expect(await f.repository.getPortalStatus(f.tokenHash)).toMatchObject({
      photos: expect.arrayContaining([{ id: f.before.id, consented: true, published: false }]),
    });
    expect(await db.prisma.workOrderPhoto.findUniqueOrThrow({ where: { id: f.before.id } })).toMatchObject({
      portfolioConsentName: 'New signer', portfolioRevokedAt: null, portfolioPublishedAt: null,
    });
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true });
    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toHaveLength(1);
  });

  it('denies access to nonexistent shares and unknown public profiles', async () => {
    const f = await fixture();
    const unknown = 'f'.repeat(64);
    await expect(f.repository.getPortalStatus(unknown)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    await expect(f.repository.consent(unknown, f.consent)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    await expect(f.repository.revoke(unknown, f.before.id)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(await f.repository.listPublishedForSlug('missing-' + f.profile.slug)).toEqual([]);
    await expect(f.repository.getPublicPhotoKey('missing-' + f.profile.slug, f.before.id)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
  });

  it('rejects publication of a hidden or during-service photo even with another photo consented', async () => {
    const f = await fixture();
    await f.repository.consent(f.tokenHash, f.consent);
    await expect(f.repository.publish({ ...f.params, photoId: f.hidden.id }, { publish: true })).rejects.toThrow('PORTFOLIO_CONSENT_REQUIRED');
    await expect(f.repository.publish({ ...f.params, photoId: f.during.id }, { publish: true })).rejects.toThrow('PORTFOLIO_CONSENT_REQUIRED');
    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toEqual([]);
  });

  it('rejects malformed publication values before opening a write transaction', async () => {
    const f = await fixture();
    expect(() => f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: 'true' } as unknown as { publish: boolean }))
      .toThrow('INVALID_PORTFOLIO_CONSENT');
    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toEqual([]);
  });

  it('never publishes photos for work orders no longer completed', async () => {
    const f = await fixture();
    await f.repository.consent(f.tokenHash, f.consent);
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true });
    await db.prisma.workOrder.update({ where: { id: f.order.id }, data: { status: 'IN_PROGRESS', completedAt: null } });
    expect(await f.repository.listPublishedForSlug(f.profile.slug)).toEqual([]);
    await expect(f.repository.getPublicPhotoKey(f.profile.slug, f.before.id)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
    await expect(f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: true })).rejects.toThrow('PORTFOLIO_WORK_ORDER_NOT_COMPLETED');
    await f.repository.publish({ ...f.params, photoId: f.before.id }, { publish: false });
  });

  it('limits public photos to twelve and returns only the public stage and dimensions', async () => {
    const f = await fixture();
    const photos = await Promise.all(Array.from({ length: 13 }, (_, index) => f.photo(index % 2 === 0 ? 'AFTER' : 'BEFORE')));
    await f.repository.consent(f.tokenHash, { ...f.consent, photoIds: photos.map((photo) => photo.id) });
    for (const photo of photos) await f.repository.publish({ ...f.params, photoId: photo.id }, { publish: true });
    const published = await f.repository.listPublishedForSlug(f.profile.slug);
    expect(published).toHaveLength(12);
    expect(published.some((photo) => photo.stage === 'AFTER')).toBe(true);
    for (const photo of published) {
      expect(Object.keys(photo).sort()).toEqual(['height', 'id', 'stage', 'width']);
      expect(photo).toMatchObject({ width: 800, height: 600 });
    }
  });
});
