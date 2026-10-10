import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Lead } from '../../domain/entities/lead.entity.js';
import { LeadError } from '../../domain/errors/lead.error.js';
import type { LeadPageParams } from '../../domain/repositories/lead.repository.js';
import { LeadRepository } from '../../domain/repositories/lead.repository.js';

export class PrismaLeadRepository extends LeadRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async create(lead: Lead) {
    const state = this.scopedState(lead);

    const result = await this.db.lead.createMany({
      data: [state],
      skipDuplicates: true,
    });

    const saved = await this.db.lead.findUnique({
      where: {
        requestKey: state.requestKey,
      },
    });

    if (saved === null || saved.organizationId !== this.organizationId) {
      throw new LeadError('LEAD_REQUEST_CONFLICT');
    }

    return {
      lead: saved,
      created: result.count === 1,
    };
  }

  findById(id: string) {
    return this.db.lead.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });
  }

  async list(params: LeadPageParams) {
    const { page, limit, status, search: searchInput } = params;
    const search = searchInput?.trim();

    const where: Prisma.LeadWhereInput = {
      organizationId: this.organizationId,
      status,
    };

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: search,
          },
        },
        {
          requestedServiceName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const rows = await this.db.lead.findMany({
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

  async save(lead: Lead): Promise<void> {
    const state = this.scopedState(lead);

    const result = await this.db.lead.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
      },
      data: {
        status: state.status,
        convertedCustomerId: state.convertedCustomerId,
        convertedQuoteId: state.convertedQuoteId,
        contactedAt: state.contactedAt,
        convertedAt: state.convertedAt,
        archivedAt: state.archivedAt,
        updatedAt: state.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new LeadError('LEAD_NOT_FOUND');
    }
  }

  private scopedState(lead: Lead) {
    const state = lead.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new LeadError('LEAD_NOT_FOUND');
    }

    return state;
  }
}
