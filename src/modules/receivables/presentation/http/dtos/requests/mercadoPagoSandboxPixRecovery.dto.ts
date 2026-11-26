import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import type { RecoverMercadoPagoSandboxPixInput } from '../../../../application/types/mercadoPagoSandboxPixRecovery.types.js';

export class RecoverMercadoPagoSandboxPixDto implements RecoverMercadoPagoSandboxPixInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  issuanceId!: string;
}
