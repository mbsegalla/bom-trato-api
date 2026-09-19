import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Customer } from '../../domain/entities/customer.entity.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import { CustomerRepository } from '../../domain/repositories/customer.repository.js';
import type { CustomerOverviewSummary, CustomerPageParams } from '../../domain/types/customer.types.js';

interface CustomerOverviewRow {
  quoteCount: string;
  workOrderCount: string;
  completedWorkOrderCount: string;
  pendingAmountInCents: string;
  overdueAmountInCents: string;
  receivedAmountInCents: string;
}

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

  async overviewSummary(customerId: string, now: Date): Promise<CustomerOverviewSummary> {
    const rows = await this.db.$queryRaw<CustomerOverviewRow[]>`
      WITH quote_totals AS (
        SELECT COUNT(*)::text AS "quoteCount"
        FROM "Quote"
        WHERE "organizationId" = ${this.organizationId}::uuid
          AND "customerId" = ${customerId}::uuid
      ),
      work_order_totals AS (
        SELECT
          COUNT(*)::text AS "workOrderCount",
          (
            COUNT(*) FILTER (
              WHERE "status" = 'COMPLETED'
            )
          )::text AS "completedWorkOrderCount"
        FROM "WorkOrder"
        WHERE "organizationId" = ${this.organizationId}::uuid
          AND "customerId" = ${customerId}::uuid
      ),
      receivable_totals AS (
        SELECT
          COALESCE(
            SUM(
              "amountInCents"::bigint -
              "receivedInCents"::bigint
            ),
            0
          )::text AS "pendingAmountInCents",
  
          COALESCE(
            SUM(
              "amountInCents"::bigint -
              "receivedInCents"::bigint
            ) FILTER (
              WHERE "dueAt" < ${now}
            ),
            0
          )::text AS "overdueAmountInCents"
  
        FROM "Receivable"
        WHERE "organizationId" = ${this.organizationId}::uuid
          AND "customerId" = ${customerId}::uuid
          AND "currency" = 'brl'
          AND "status" IN ('OPEN', 'PARTIALLY_PAID')
      ),
      payment_totals AS (
        SELECT
          COALESCE(
            SUM(payment."amountInCents"::bigint),
            0
          )::text AS "receivedAmountInCents"
  
        FROM "ReceivablePayment" AS payment
  
        INNER JOIN "Receivable" AS receivable
          ON receivable."id" = payment."receivableId"
  
        WHERE receivable."organizationId" = ${this.organizationId}::uuid
          AND receivable."customerId" = ${customerId}::uuid
          AND receivable."currency" = 'brl'
          AND payment."reversedAt" IS NULL
      )
      SELECT
        quote_totals."quoteCount",
        work_order_totals."workOrderCount",
        work_order_totals."completedWorkOrderCount",
        receivable_totals."pendingAmountInCents",
        receivable_totals."overdueAmountInCents",
        payment_totals."receivedAmountInCents"
      FROM quote_totals
      CROSS JOIN work_order_totals
      CROSS JOIN receivable_totals
      CROSS JOIN payment_totals
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new CustomerError('CUSTOMER_OVERVIEW_VALUE_OUT_OF_RANGE');
    }

    return {
      quoteCount: this.overviewNumber(row.quoteCount),
      workOrderCount: this.overviewNumber(row.workOrderCount),
      completedWorkOrderCount: this.overviewNumber(row.completedWorkOrderCount),
      currency: 'brl',
      pendingAmountInCents: this.overviewNumber(row.pendingAmountInCents),
      overdueAmountInCents: this.overviewNumber(row.overdueAmountInCents),
      receivedAmountInCents: this.overviewNumber(row.receivedAmountInCents),
    };
  }

  private overviewNumber(value: string): number {
    if (!/^\d+$/.test(value)) {
      throw new CustomerError('CUSTOMER_OVERVIEW_VALUE_OUT_OF_RANGE');
    }

    const number = BigInt(value);

    if (number > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CustomerError('CUSTOMER_OVERVIEW_VALUE_OUT_OF_RANGE');
    }

    return Number(number);
  }

  private scopedState(customer: Customer) {
    const state = customer.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new CustomerError('CUSTOMER_NOT_FOUND');
    }

    return state;
  }
}
