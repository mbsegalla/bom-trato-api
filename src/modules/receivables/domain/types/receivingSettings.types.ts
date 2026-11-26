export const PIX_KEY_TYPES = ['CPF', 'CNPJ', 'PHONE', 'EMAIL', 'EVP'] as const;

export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export interface ReceivingSettings {
  pixEnabled: boolean;
  pixKeyType: PixKeyType | null;
  pixKey: string | null;
  merchantName: string | null;
  merchantCity: string | null;
}

export interface SaveReceivingSettingsInput extends ReceivingSettings {
  version: number;
  confirmed: boolean;
}
