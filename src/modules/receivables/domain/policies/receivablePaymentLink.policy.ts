export const RECEIVABLE_PAYMENT_LINK_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface LinkSnapshot {
  createdById: string;
  expiresAt: Date;
  revokedAt: Date | null;
  receivableVersion: number;
  receivingSettingsVersion: number;
}

interface CurrentPaymentContext {
  ownerId: string;
  receivableVersion: number;
  receivingSettingsVersion: number;
}

export function isReceivablePaymentLinkCurrent(link: LinkSnapshot, context: CurrentPaymentContext, now: Date): boolean {
  return (
    link.revokedAt === null &&
    link.expiresAt.getTime() > now.getTime() &&
    link.createdById === context.ownerId &&
    link.receivableVersion === context.receivableVersion &&
    link.receivingSettingsVersion === context.receivingSettingsVersion
  );
}
