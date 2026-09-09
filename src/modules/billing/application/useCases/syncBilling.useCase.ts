import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository, SaveSnapshotParams } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';

export interface SyncBillingParams {
  organizationId: string;
  invoiceId?: string;
  eventId?: string;
  includeInvoiceHistory?: boolean;
}

export class SyncBillingUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
  ) {}

  async execute({
    organizationId,
    invoiceId,
    eventId,
    includeInvoiceHistory = false,
  }: SyncBillingParams): Promise<void> {
    await this.billingLock.run(`organization:${organizationId}`, async () => {
      if (eventId !== undefined && (await this.billingRepository.isProcessed(eventId))) {
        return;
      }

      const customer = await this.billingRepository.customer(organizationId);

      if (customer.stripeCustomerId === null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      const snapshot = await this.billingGateway.snapshot(customer.stripeCustomerId, invoiceId, includeInvoiceHistory);

      const attempt = await this.billingRepository.pendingCheckout(organizationId);

      let checkout: SaveSnapshotParams['checkout'];

      if (attempt !== null) {
        const session =
          attempt.stripeSessionId !== null
            ? await this.billingGateway.checkout(attempt.stripeSessionId)
            : await this.billingGateway.findCheckout(customer.stripeCustomerId, attempt.id);

        if (session !== null && session.status !== 'OPEN') {
          checkout = {
            id: attempt.id,
            stripeSessionId: session.stripeSessionId,
            status: session.status,
          };
        }
      }

      await this.billingRepository.saveSnapshot({
        organizationId,
        snapshot,
        eventId,
        checkout,
        nextReconcileAt: includeInvoiceHistory ? new Date(Date.now() + 60 * 60 * 1000) : undefined,
      });
    });
  }
}
