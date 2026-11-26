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
});
