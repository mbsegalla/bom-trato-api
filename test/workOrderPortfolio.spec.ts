import { describe, expect, it, vi } from 'vitest';

import type { PrivateObjectStorage } from '../src/shared/storage/privateObjectStorage.port.js';
import type { WorkOrderPortfolioRepository } from '../src/modules/workOrders/application/ports/workOrderPortfolio.repository.js';
import { GetPublicPortfolioPhotoContentUseCase } from '../src/modules/workOrders/application/useCases/getPublicPortfolioPhotoContent.useCase.js';
import { ManageWorkOrderPortfolioUseCase } from '../src/modules/workOrders/application/useCases/manageWorkOrderPortfolio.useCase.js';
import { PublicPortfolioConsentUseCase } from '../src/modules/workOrders/application/useCases/publicPortfolioConsent.useCase.js';
import { NodeWorkOrderShareSecurity } from '../src/modules/workOrders/infrastructure/security/nodeWorkOrderShareSecurity.js';

const TOKEN = 'a'.repeat(64);
const key = 'private/organization/photo.webp';
const status = {
  canAuthorize: true,
  photos: [{ id: 'photo', consented: false, published: false }],
};

function setup() {
  const repository = {
    getPortalStatus: vi.fn(async () => status),
    consent: vi.fn(async () => status),
    revoke: vi.fn(async () => status),
    listForOrganization: vi.fn(async () => ({ photos: [] })),
    publish: vi.fn(async () => ({ photos: [] })),
    revokeForOrganization: vi.fn(async () => ({ photos: [] })),
    listPublishedForSlug: vi.fn(async () => []),
    getPublicPhotoKey: vi.fn(async () => key),
  };

  const storage = {
    get: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };

  return {
    repository,
    storage,
    security: new NodeWorkOrderShareSecurity(),
    publicConsent: new PublicPortfolioConsentUseCase(
      repository as unknown as WorkOrderPortfolioRepository,
      new NodeWorkOrderShareSecurity(),
    ),
    management: new ManageWorkOrderPortfolioUseCase(repository as unknown as WorkOrderPortfolioRepository),
    photo: new GetPublicPortfolioPhotoContentUseCase(
      repository as unknown as WorkOrderPortfolioRepository,
      storage as unknown as PrivateObjectStorage,
    ),
  };
}

describe('portfolio consent via private work order share', () => {
  it('never passes the raw token into persistence', async () => {
    const fixture = setup();
    await fixture.publicConsent.status(TOKEN);

    expect(fixture.repository.getPortalStatus).toHaveBeenCalledWith(fixture.security.hash(TOKEN));
    expect(fixture.repository.getPortalStatus).not.toHaveBeenCalledWith(TOKEN);
  });

  it('passes the explicit consent fields without changing them', async () => {
    const fixture = setup();
    const input = {
      photoIds: ['photo'],
      signerName: 'Cliente Autorizado',
      consent: true as const,
      consentVersion: '1',
    };

    await fixture.publicConsent.consent(TOKEN, input);

    expect(fixture.repository.consent).toHaveBeenCalledWith(fixture.security.hash(TOKEN), input);
  });

  it('allows withdrawal through the private share token', async () => {
    const fixture = setup();
    await fixture.publicConsent.revoke(TOKEN, 'photo');

    expect(fixture.repository.revoke).toHaveBeenCalledWith(fixture.security.hash(TOKEN), 'photo');
  });

  it('allows the organization to withdraw consent when the share link is no longer available', async () => {
    const fixture = setup();
    const params = { organizationId: 'organization', workOrderId: 'work-order', photoId: 'photo', userId: 'member' };

    await fixture.management.revoke(params);

    expect(fixture.repository.revokeForOrganization).toHaveBeenCalledWith(params);
  });
});

describe('public portfolio image content', () => {
  it('loads image bytes only after checking that the photo is published', async () => {
    const fixture = setup();
    const bytes = await fixture.photo.execute('empresa', 'photo');

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(fixture.repository.getPublicPhotoKey).toHaveBeenCalledTimes(2);
    expect(fixture.storage.get).toHaveBeenCalledWith(key);
  });

  it('rejects a photo that was revoked during the storage read', async () => {
    const fixture = setup();
    fixture.repository.getPublicPhotoKey.mockResolvedValueOnce(key).mockResolvedValueOnce('different-key');

    await expect(fixture.photo.execute('empresa', 'photo')).rejects.toMatchObject({
      code: 'PUBLIC_PROFILE_NOT_FOUND',
    });
  });

  it('does not return storage details when the private bucket fails', async () => {
    const fixture = setup();
    fixture.storage.get.mockRejectedValueOnce(new Error('private bucket credentials'));

    await expect(fixture.photo.execute('empresa', 'photo')).rejects.toMatchObject({
      code: 'PUBLIC_PROFILE_NOT_FOUND',
    });
  });
});
