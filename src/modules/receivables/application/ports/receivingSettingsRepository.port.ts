import type { OrganizationActorParams } from '../../../organizations/application/ports/organizationUnitOfWork.port.js';
import type { ReceivingSettingsView, SaveReceivingSettingsInput } from '../types/receivingSettings.types.js';

export abstract class ReceivingSettingsRepository {
  abstract read(params: OrganizationActorParams): Promise<ReceivingSettingsView>;
  abstract save(params: OrganizationActorParams, input: SaveReceivingSettingsInput): Promise<ReceivingSettingsView>;
}
