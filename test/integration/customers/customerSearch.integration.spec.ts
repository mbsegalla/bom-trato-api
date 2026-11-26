import { expect, it } from 'vitest';

import { CustomerApplicationService } from '../../../src/modules/customers/application/services/customerApplicationService.service.js';
import { CreateCustomerUseCase } from '../../../src/modules/customers/application/useCases/createCustomer.useCase.js';
import { GetCustomerOverviewUseCase } from '../../../src/modules/customers/application/useCases/getCustomerOverview.useCase.js';
import { ListCustomersUseCase } from '../../../src/modules/customers/application/useCases/listCustomers.useCase.js';
import { PrismaCustomerUnitOfWork } from '../../../src/modules/customers/infrastructure/transactions/prismaCustomerUnitOfWork.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('customer search and overview (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function tenant() {
    const actor = await db.tenant();

    db.cleanup(() => db.prisma.customer.deleteMany({ where: { organizationId: actor.organizationId } }));

    return actor;
  }

  it('treats SQL wildcard characters as literal search text and never returns another tenant', async () => {
    const actor = await tenant();
    const other = await tenant();
    const service = new CustomerApplicationService(new PrismaCustomerUnitOfWork(db.prisma));
    const create = new CreateCustomerUseCase(service);
    const list = new ListCustomersUseCase(service);

    const percent = await create.execute(actor, { name: 'Fixture 100% literal', phone: '34999991234' });
    const underscore = await create.execute(actor, { name: 'Fixture A_B literal', phone: '34999991234' });

    await create.execute(actor, { name: 'Fixture 100X literal', phone: '34999991234' });
    await create.execute(actor, { name: 'Fixture ACB literal', phone: '34999991234' });
    await create.execute(other, { name: 'Fixture 100% literal', phone: '34999991234' });

    const params = { page: 1, limit: 10, status: 'ALL' as const };

    expect((await list.execute(actor, { ...params, search: '100%' })).items.map((item) => item.id)).toEqual([
      percent.id,
    ]);
    expect((await list.execute(actor, { ...params, search: 'a_b' })).items.map((item) => item.id)).toEqual([
      underscore.id,
    ]);
  });

  it('returns disjoint pages and a correctly bounded hasMore flag', async () => {
    const actor = await tenant();
    const service = new CustomerApplicationService(new PrismaCustomerUnitOfWork(db.prisma));
    const create = new CreateCustomerUseCase(service);
    const list = new ListCustomersUseCase(service);

    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const customer = await create.execute(actor, { name: 'Fixture customer ' + index, phone: '34999991234' });
      ids.push(customer.id);
    }

    const first = await list.execute(actor, { page: 1, limit: 2, status: 'ALL' });
    const second = await list.execute(actor, { page: 2, limit: 2, status: 'ALL' });
    const third = await list.execute(actor, { page: 3, limit: 2, status: 'ALL' });

    expect(first).toMatchObject({ page: 1, hasMore: true });
    expect(second).toMatchObject({ page: 2, hasMore: false });
    expect(third).toEqual({ items: [], page: 3, hasMore: false });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect([...first.items, ...second.items].map((item) => item.id).sort()).toEqual(ids.sort());
  });

  it('returns zero financial and operational totals for a new customer and denies cross-tenant overview', async () => {
    const actor = await tenant();
    const other = await tenant();
    const service = new CustomerApplicationService(new PrismaCustomerUnitOfWork(db.prisma));
    const customer = await new CreateCustomerUseCase(service).execute(actor, {
      name: 'Fixture customer',
      phone: '34999991234',
    });
    const overview = new GetCustomerOverviewUseCase(service);

    const result = await overview.execute({ ...actor, customerId: customer.id });

    expect(result.customer.id).toBe(customer.id);
    expect(result.summary).toEqual({
      quoteCount: 0,
      workOrderCount: 0,
      completedWorkOrderCount: 0,
      pendingAmountInCents: 0,
      overdueAmountInCents: 0,
      receivedAmountInCents: 0,
      currency: 'brl',
    });
    expect(result.generatedAt).toBeInstanceOf(Date);

    await expect(overview.execute({ ...other, customerId: customer.id })).rejects.toThrow('CUSTOMER_NOT_FOUND');
  });
});
