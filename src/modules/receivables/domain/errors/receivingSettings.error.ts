import type { OrganizationAccessDenial } from '../../../organizations/domain/policies/organizationAccess.policy.js';

export type ReceivingSettingsErrorCode =
  | OrganizationAccessDenial
  | 'ORGANIZATION_NOT_FOUND'
  | 'OWNER_REQUIRED'
  | 'INVALID_RECEIVING_SETTINGS'
  | 'RECEIVING_SETTINGS_VERSION_CONFLICT'
  | 'RECEIVING_SETTINGS_UNAVAILABLE'
  | 'RECEIVING_SETTINGS_BUSY';

export class ReceivingSettingsError extends Error {
  constructor(readonly code: ReceivingSettingsErrorCode) {
    super(code);
    this.name = ReceivingSettingsError.name;
  }
}
