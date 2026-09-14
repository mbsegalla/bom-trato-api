import type { CatalogService, CatalogServiceProps } from '../entities/catalogService.entity.js';
import type { CatalogServicePage, CatalogServicePageParams } from '../types/catalogServicePage.types.js';

export abstract class CatalogServiceRepository {
  abstract create(catalogService: CatalogService): Promise<void>;
  abstract findById(id: string): Promise<CatalogServiceProps | null>;
  abstract list(params: CatalogServicePageParams): Promise<CatalogServicePage<CatalogServiceProps>>;
  abstract save(catalogService: CatalogService): Promise<void>;
}
