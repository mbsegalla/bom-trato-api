import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Customer } from '../../domain/entities/customer.entity.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import { CustomerRepository } from '../../domain/repositories/customer.repository.js';
import type { CustomerPageParams } from '../../domain/types/customer.types.js';

export class PrismaCustomerRepository extends CustomerRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async create(customer: Customer): Promise<void> {
    const state = this.scopedState(customer);

    await this.db.customer.create({
      data: state,
    });
  }

  findById(id: string) {
    return this.db.customer.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });
  }

  async list(params: CustomerPageParams) {
    const { page, limit, search, status } = params;

    const where: Prisma.CustomerWhereInput = {
      organizationId: this.organizationId,
    };

    if (status === 'ACTIVE') {
      where.archivedAt = null;
    } else if (status === 'ARCHIVED') {
      where.archivedAt = { not: null };
    }

    if (typeof search === 'string' && search) {
      const searchTerm: string = search.trim().replace(/[\\%_]/g, '\\$&');

      where.OR = [
        {
          name: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      ];
    }

    const rows = await this.db.customer.findMany({
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

  async save(customer: Customer): Promise<void> {
    const state = this.scopedState(customer);

    const result = await this.db.customer.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
      },
      data: {
        name: state.name,
        email: state.email,
        phone: state.phone,
        notes: state.notes,
        archivedAt: state.archivedAt,
        updatedAt: state.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new CustomerError('CUSTOMER_NOT_FOUND');
    }
  }

  private scopedState(customer: Customer) {
    const state = customer.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new CustomerError('CUSTOMER_NOT_FOUND');
    }

    return state;
  }
}
