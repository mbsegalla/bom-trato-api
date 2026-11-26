export interface MercadoPagoWebhookNotice {
  clientId: string;
  deliveryKey: string;
  paymentId: string;
  requestId: string;
  signedAt: Date;
}
