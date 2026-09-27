import { randomUUID } from 'node:crypto';

import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import { OrganizationError } from '../../domain/errors/organization.error.js';
import { toOrganizationProfileView } from '../mappers/organizationProfile.mapper.js';
import type { OrganizationLogoImageProcessor, OrganizationLogoUpload } from '../ports/organizationLogoImage.port.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class UploadOrganizationLogoUseCase {
  constructor(
    private readonly processor: OrganizationTeamApplicationService,
    private readonly imageProcessor: OrganizationLogoImageProcessor,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(params: OrganizationActorParams, upload: OrganizationLogoUpload) {
    await this.processor.readTeam(params, async (_context, policy) => {
      policy.assertOwner();
    });

    const image = await this.imageProcessor.process(upload);

    const key = `organizations/${params.organizationId}/logo/` + `${randomUUID()}.${image.extension}`;

    try {
      await this.storage.put({
        key,
        body: image.buffer,
        contentType: image.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      });
    } catch {
      throw new OrganizationError('ORGANIZATION_LOGO_STORAGE_FAILED');
    }

    let result: {
      profile: ReturnType<Organization['profile']>;
      previousLogoKey: string | null;
    };

    try {
      result = await this.processor.withTeam(params, async (tx, policy) => {
        policy.assertOwner();

        const organization = Organization.restore(tx.organization);

        const previousLogoKey = organization.snapshot().logoKey;

        organization.setLogo(key);

        await tx.saveOrganization(organization.snapshot());

        return {
          profile: organization.profile(),
          previousLogoKey,
        };
      });
    } catch (error: unknown) {
      await this.deleteSilently(key);

      throw error;
    }

    if (result.previousLogoKey && result.previousLogoKey !== key) {
      await this.deleteSilently(result.previousLogoKey);
    }

    return toOrganizationProfileView(result.profile, this.storage);
  }

  private async deleteSilently(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best effort cleanup. The database must remain authoritative.
    }
  }
}
