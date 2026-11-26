import type { ReceivingSettings } from '../../domain/types/receivingSettings.types.js';

export type {
  PixKeyType,
  ReceivingSettings,
  SaveReceivingSettingsInput,
} from '../../domain/types/receivingSettings.types.js';
export { PIX_KEY_TYPES } from '../../domain/types/receivingSettings.types.js';

export interface ReceivingSettingsView extends ReceivingSettings {
  version: number;
  canConfigure: boolean;
  encryptionAvailable: boolean;
}
