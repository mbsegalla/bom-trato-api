import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { OrganizationProfile } from '../../domain/entities/organization.entity.js';
import type { OrganizationProfileView } from '../types/organization.types.js';

export function toOrganizationProfileView(
  profile: OrganizationProfile,
  storage: ObjectStorage,
): OrganizationProfileView {
  const { logoKey, ...businessProfile } = profile;

  return {
    ...businessProfile,
    logoUrl: logoKey ? storage.publicUrl(logoKey) : null,
  };
}
