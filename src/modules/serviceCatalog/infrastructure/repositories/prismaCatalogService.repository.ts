import type { Prisma } from '../../../../generated/prisma/client.js';
import type { CatalogService } from '../../domain/entities/catalogService.entity.js';
import { CatalogServiceError } from '../../domain/errors/catalogService.error.js';
import { CatalogServiceRepository } from '../../domain/repositories/catalogService.repository.js';
import type { CatalogServicePageParams } from '../../domain/types/catalogServicePage.types.js';

export class PrismaCatalogServiceRepository extends CatalogServiceRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async create(catalogService: CatalogService): Promise<void> {
    const state = this.scopedState(catalogService);

    await this.db.catalogService.create({
      data: state,
    });
  }

  findById(id: string) {
    return this.db.catalogService.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });
  }

  async list(params: CatalogServicePageParams) {
    const { page, limit, search, status } = params;

    const where: Prisma.CatalogServiceWhereInput = {
      organizationId: this.organizationId,
    };

    if (status === 'ACTIVE') {
      where.archivedAt = null;
    } else if (status === 'ARCHIVED') {
      where.archivedAt = { not: null };
    }

    if (search) {
      const sanitizedSearch = search.trim().replace(/[\\%_]/g, '\\$&');

      where.OR = [
        {
          name: {
            contains: sanitizedSearch,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: sanitizedSearch,
            mode: 'insensitive',
          },
        },
      ];
    }

    const rows = await this.db.catalogService.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return {
      items: rows.slice(0, limit),
      page,
      hasMore: rows.length > limit,
    };
  }

  async save(catalogService: CatalogService): Promise<void> {
    const state = this.scopedState(catalogService);

    const result = await this.db.catalogService.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
      },
      data: {
        name: state.name,
        description: state.description,
        unit: state.unit,
        amountInCents: state.amountInCents,
        archivedAt: state.archivedAt,
        updatedAt: state.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new CatalogServiceError('CATALOG_SERVICE_NOT_FOUND');
    }
  }

  private scopedState(catalogService: CatalogService) {
    const state = catalogService.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new CatalogServiceError('CATALOG_SERVICE_NOT_FOUND');
    }

    return state;
  }
}
