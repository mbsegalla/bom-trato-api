import type { OrganizationActorParams } from '../../../organizations/application/ports/organizationUnitOfWork.port.js';

export interface MercadoPagoConnectionActor extends OrganizationActorParams {
  sessionId: string;
}

export type MercadoPagoConnectionStatus =
  'NOT_CONNECTED' | 'CONNECTED' | 'EXPIRED' | 'DISCONNECTED' | 'RECONNECT_REQUIRED';

export interface MercadoPagoConnectionView {
  available: boolean;
  liveMode: boolean;
  canConnect: boolean;
  canDisconnect: boolean;
  status: MercadoPagoConnectionStatus;
  accountId: string | null;
  connectedAt: Date | null;
  expiresAt: Date | null;
}

export interface MercadoPagoStartView {
  authorizationUrl: string;
  expiresAt: Date;
}

export interface MercadoPagoCompletionInput {
  state: string;
  code: string;
}

export interface MercadoPagoCompletionView {
  organizationId: string;
  organizationName: string;
  accountId: string;
  liveMode: boolean;
}
