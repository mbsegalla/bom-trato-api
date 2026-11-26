import type { OrganizationActorParams } from '../../../organizations/application/ports/organizationUnitOfWork.port.js';
import type { ReceivingSettingsRepository } from '../ports/receivingSettingsRepository.port.js';
import type { SaveReceivingSettingsInput } from '../types/receivingSettings.types.js';

export class ManageReceivingSettingsUseCase {
  constructor(private readonly repository: ReceivingSettingsRepository) {}

  read(params: OrganizationActorParams) {
    return this.repository.read(params);
  }

  save(params: OrganizationActorParams, input: SaveReceivingSettingsInput) {
    return this.repository.save(params, input);
  }
}
