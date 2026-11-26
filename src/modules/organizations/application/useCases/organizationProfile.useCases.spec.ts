import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { UpdateBillingCustomerNameUseCase } from '../../../billing/application/useCases/updateBillingCustomerName.useCase.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import type { OrganizationLogoImageProcessor } from '../ports/organizationLogoImage.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

import { GetOrganizationProfileUseCase } from './getOrganizationProfile.useCase.js';
import { RemoveOrganizationLogoUseCase } from './removeOrganizationLogo.useCase.js';
import { UpdateOrganizationProfileUseCase } from './updateOrganizationProfile.useCase.js';
import { UploadOrganizationLogoUseCase } from './uploadOrganizationLogo.useCase.js';

const params = { organizationId: 'org', userId: 'owner' };
const previous = 'organizations/org/logo/old.webp';
const upload = { buffer: Buffer.from('fixture source'), size: 14, mimeType: 'image/png' };
const image = { buffer: Buffer.from('fixture processed'), contentType: 'image/webp', extension: 'webp' };

function fixture(hasLogo = true) {
  const organization = Organization.create({
    id: params.organizationId,
    ownerId: params.userId,
    name: 'Fixture company',
  });
  if (hasLogo) {
    organization.setLogo(previous);
  }
  const snapshot = organization.snapshot();
  const saveOrganization = vi.fn().mockResolvedValue(undefined);
  const assertOwner = vi.fn();
  const assertMember = vi.fn();
  const policy = { assertOwner, assertMember };
  const tx = { organization: snapshot, saveOrganization };
  const readTeam = vi.fn(
    async (_params: unknown, operation: (context: typeof tx, authorization: typeof policy) => Promise<unknown>) =>
      operation(tx, policy),
  );
  const withTeam = vi.fn(
    async (_params: unknown, operation: (context: typeof tx, authorization: typeof policy) => Promise<unknown>) =>
      operation(tx, policy),
  );
  const processor = { readTeam, withTeam } as unknown as OrganizationTeamApplicationService;
  const put = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const publicUrl = vi.fn((key: string) => 'https://cdn.example.invalid/' + key);
  const storage = { put, delete: remove, publicUrl } as unknown as ObjectStorage;
  const process = vi.fn().mockResolvedValue(image);
  const updateBilling = vi.fn().mockResolvedValue(undefined);

  return {
    get: new GetOrganizationProfileUseCase(processor, storage),
    update: new UpdateOrganizationProfileUseCase(
      processor,
      { execute: updateBilling } as unknown as UpdateBillingCustomerNameUseCase,
      storage,
    ),
    upload: new UploadOrganizationLogoUseCase(processor, { process }, storage),
    removeLogo: new RemoveOrganizationLogoUseCase(processor, storage),
    assertOwner,
    assertMember,
    readTeam,
    withTeam,
    saveOrganization,
    put,
    remove,
    publicUrl,
    process,
    updateBilling,
  };
}

describe('organization profile and logo operations', () => {
  it('returns a member-visible profile without internal owner or storage key', async () => {
    const f = fixture();
    const profile = await f.get.execute(params);
    expect(f.assertMember).toHaveBeenCalledTimes(1);
    expect(profile).toMatchObject({
      id: 'org',
      name: 'Fixture company',
      logoUrl: 'https://cdn.example.invalid/' + previous,
    });
    expect(profile).not.toHaveProperty('ownerId');
    expect(profile).not.toHaveProperty('logoKey');
  });

  it('does not resolve a storage URL when no logo exists', async () => {
    const f = fixture(false);
    expect(await f.get.execute(params)).toMatchObject({ logoUrl: null });
    expect(f.publicUrl).not.toHaveBeenCalled();
  });

  it('rejects nonmembers before exposing any profile URL', async () => {
    const f = fixture();
    f.assertMember.mockImplementation(() => {
      throw new Error('MEMBER_REQUIRED');
    });
    await expect(f.get.execute(params)).rejects.toThrow('MEMBER_REQUIRED');
    expect(f.publicUrl).not.toHaveBeenCalled();
  });

  it('updates the billing name before writing the profile and revalidates ownership', async () => {
    const f = fixture();
    expect(await f.update.execute(params, { name: '  New company  ' })).toMatchObject({ name: 'New company' });
    expect(f.updateBilling).toHaveBeenCalledWith({ organizationId: 'org', name: 'New company' });
    expect(f.updateBilling.mock.invocationCallOrder[0]).toBeLessThan(f.saveOrganization.mock.invocationCallOrder[0]);
    expect(f.assertOwner).toHaveBeenCalledTimes(2);
    expect(f.saveOrganization).toHaveBeenCalledWith(expect.objectContaining({ name: 'New company' }));
  });

  it('does not call billing when updating business details without a name change', async () => {
    const f = fixture();
    expect(await f.update.execute(params, { email: 'new@example.invalid', defaultReceivableDueDays: 0 })).toMatchObject(
      { email: 'new@example.invalid', defaultReceivableDueDays: 0 },
    );
    expect(f.updateBilling).not.toHaveBeenCalled();
  });

  it('does not save the local name when billing synchronization fails', async () => {
    const f = fixture();
    f.updateBilling.mockRejectedValue(new Error('billing unavailable'));
    await expect(f.update.execute(params, { name: 'New company' })).rejects.toThrow('billing unavailable');
    expect(f.saveOrganization).not.toHaveBeenCalled();
  });

  it('rejects invalid details before invoking billing or writing', async () => {
    const f = fixture();
    await expect(f.update.execute(params, { name: ' ' })).rejects.toThrow('INVALID_ORGANIZATION_NAME');
    expect(f.updateBilling).not.toHaveBeenCalled();
    expect(f.withTeam).not.toHaveBeenCalled();
  });

  it('rejects logo uploads before image processing when ownership fails', async () => {
    const f = fixture();
    f.assertOwner.mockImplementation(() => {
      throw new Error('OWNER_REQUIRED');
    });
    await expect(f.upload.execute(params, upload)).rejects.toThrow('OWNER_REQUIRED');
    expect(f.process).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  });

  it('stores a versioned logo before persisting the new key and removes the previous object after commit', async () => {
    const f = fixture();
    const profile = await f.upload.execute(params, upload);
    const key = f.put.mock.calls[0][0].key as string;
    expect(key).toMatch(/^organizations\/org\/logo\/[a-f0-9-]+\.webp$/);
    expect(f.put).toHaveBeenCalledWith({
      key,
      body: image.buffer,
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    expect(f.saveOrganization).toHaveBeenCalledWith(expect.objectContaining({ logoKey: key }));
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(previous);
    expect(f.put.mock.invocationCallOrder[0]).toBeLessThan(f.saveOrganization.mock.invocationCallOrder[0]);
    expect(f.saveOrganization.mock.invocationCallOrder[0]).toBeLessThan(f.remove.mock.invocationCallOrder[0]);
    expect(profile.logoUrl).toBe('https://cdn.example.invalid/' + key);
  });

  it('does not delete an object for the first logo upload', async () => {
    const f = fixture(false);
    await f.upload.execute(params, upload);
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('maps storage failures and never persists an unavailable logo', async () => {
    const f = fixture();
    f.put.mockRejectedValue(new Error('private upstream failure'));
    await expect(f.upload.execute(params, upload)).rejects.toThrow('ORGANIZATION_LOGO_STORAGE_FAILED');
    expect(f.withTeam).not.toHaveBeenCalled();
  });

  it('cleans up the newly uploaded object when persistence fails', async () => {
    const f = fixture();
    f.saveOrganization.mockRejectedValue(new Error('database failure'));
    await expect(f.upload.execute(params, upload)).rejects.toThrow('database failure');
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(f.put.mock.calls[0][0].key);
    expect(f.remove).not.toHaveBeenCalledWith(previous);
  });

  it('preserves the original persistence error when cleanup also fails', async () => {
    const f = fixture();
    f.saveOrganization.mockRejectedValue(new Error('database failure'));
    f.remove.mockRejectedValue(new Error('cleanup failure'));
    await expect(f.upload.execute(params, upload)).rejects.toThrow('database failure');
  });

  it('returns the committed profile even if previous-logo cleanup fails', async () => {
    const f = fixture();
    f.remove.mockRejectedValue(new Error('cleanup failure'));
    await expect(f.upload.execute(params, upload)).resolves.toMatchObject({ logoUrl: expect.any(String) });
  });

  it('removes the persisted logo before attempting best effort deletion', async () => {
    const f = fixture();
    expect(await f.removeLogo.execute(params)).toMatchObject({ logoUrl: null });
    expect(f.saveOrganization).toHaveBeenCalledWith(expect.objectContaining({ logoKey: null }));
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(previous);
    expect(f.saveOrganization.mock.invocationCallOrder[0]).toBeLessThan(f.remove.mock.invocationCallOrder[0]);
  });

  it('does not delete anything when no logo is configured', async () => {
    const f = fixture(false);
    expect(await f.removeLogo.execute(params)).toMatchObject({ logoUrl: null });
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('keeps a successful logo removal despite a storage cleanup failure', async () => {
    const f = fixture();
    f.remove.mockRejectedValue(new Error('cleanup failure'));
    await expect(f.removeLogo.execute(params)).resolves.toMatchObject({ logoUrl: null });
  });
});
