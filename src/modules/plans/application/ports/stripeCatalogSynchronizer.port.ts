import type { StripeCatalogSyncResult, StripeCatalogWebhookType } from '../../domain/types/stripeCatalog.types.js';

export abstract class StripeCatalogSynchronizer {
  abstract syncAll(): Promise<StripeCatalogSyncResult>;
  abstract syncWebhook(type: StripeCatalogWebhookType, stripeObjectId: string): Promise<void>;
}
