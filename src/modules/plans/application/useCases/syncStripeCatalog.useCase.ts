import type { StripeCatalogSyncResult, StripeCatalogWebhookType } from '../../domain/types/stripeCatalog.types.js';
import type { StripeCatalogSynchronizer } from '../ports/stripeCatalogSynchronizer.port.js';

export class SyncStripeCatalogUseCase {
  constructor(private readonly synchronizer: StripeCatalogSynchronizer) {}

  execute(): Promise<StripeCatalogSyncResult> {
    return this.synchronizer.syncAll();
  }

  executeWebhook(type: StripeCatalogWebhookType, stripeObjectId: string): Promise<void> {
    return this.synchronizer.syncWebhook(type, stripeObjectId);
  }
}
