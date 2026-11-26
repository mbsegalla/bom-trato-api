import { ApiProperty } from '@nestjs/swagger';

import { PIX_KEY_TYPES, type PixKeyType, type ReceivingSettingsView } from '../../../../application/types/receivingSettings.types.js';

export class ReceivingSettingsResponseDto implements ReceivingSettingsView {
  @ApiProperty()
  pixEnabled!: boolean;

  @ApiProperty({ enum: [...PIX_KEY_TYPES], nullable: true })
  pixKeyType!: PixKeyType | null;

  @ApiProperty({ type: String, nullable: true })
  pixKey!: string | null;

  @ApiProperty({ type: String, nullable: true })
  merchantName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  merchantCity!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  canConfigure!: boolean;

  @ApiProperty()
  encryptionAvailable!: boolean;
}
