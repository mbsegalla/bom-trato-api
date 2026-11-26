import { ApiProperty } from '@nestjs/swagger';

import type {
  MercadoPagoCompletionView,
  MercadoPagoConnectionStatus,
  MercadoPagoConnectionView,
  MercadoPagoStartView,
} from '../../../../application/types/mercadoPagoConnection.types.js';

export class MercadoPagoConnectionResponseDto implements MercadoPagoConnectionView {
  @ApiProperty()
  available!: boolean;

  @ApiProperty()
  liveMode!: boolean;

  @ApiProperty()
  canConnect!: boolean;

  @ApiProperty()
  canDisconnect!: boolean;

  @ApiProperty({ enum: ['NOT_CONNECTED', 'CONNECTED', 'EXPIRED', 'DISCONNECTED', 'RECONNECT_REQUIRED'] })
  status!: MercadoPagoConnectionStatus;

  @ApiProperty({ type: String, nullable: true })
  accountId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  connectedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: Date | null;
}

export class MercadoPagoStartResponseDto implements MercadoPagoStartView {
  @ApiProperty({ format: 'uri' })
  authorizationUrl!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class MercadoPagoCompletionResponseDto implements MercadoPagoCompletionView {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  accountId!: string;

  @ApiProperty()
  liveMode!: boolean;
}
