import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository, SaveSnapshotParams } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { SyncBillingParams } from '../types/billing.types.js';

export class SyncBillingUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
  ) {}

  async execute(params: SyncBillingParams): Promise<void> {
    await this.billingLock.run(`organization:${params.organizationId}`, async () => {
      let snapshot: SaveSnapshotParams;

      try {
        snapshot = await this.prepareSnapshot(params);
      } catch (error: unknown) {
        if (error instanceof BillingError) {
          throw error;
        }

        throw new BillingError('BILLING_READ_FAILED', { cause: error });
      }

      await this.billingRepository.saveSnapshot(snapshot);
    });
  }

  private async prepareSnapshot(params: SyncBillingParams): Promise<SaveSnapshotParams> {
    const { organizationId, invoiceId, includeInvoiceHistory = false, reconcile = false } = params;

    const customer = await this.billingRepository.customer(organizationId);

    if (customer.stripeCustomerId === null) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    const startedAt = new Date();

    const fullHistory = includeInvoiceHistory || (reconcile && customer.invoiceHistorySyncedAt === null);

    const reconciliation =
      reconcile && !fullHistory && customer.invoiceHistorySyncedAt !== null
        ? {
            createdSince: new Date(customer.invoiceHistorySyncedAt.getTime() - 86400000),
            pendingInvoiceIds: await this.billingRepository.pendingInvoiceIds(organizationId),
          }
        : undefined;

    const snapshot = await this.billingGateway.snapshot(
      customer.stripeCustomerId,
      invoiceId,
      fullHistory,
      reconciliation,
    );

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

    return {
      organizationId,
      snapshot,
      checkout,
      nextReconcileAt: reconcile || fullHistory ? new Date(Date.now() + 60 * 60 * 1000) : undefined,
      invoiceHistorySyncedAt: reconcile || fullHistory ? startedAt : undefined,
    };
  }
}
