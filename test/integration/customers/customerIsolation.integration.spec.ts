import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/infrastructure/database/prisma.service.js';
import { CustomerApplicationService } from '../../../src/modules/customers/application/services/customerApplicationService.service.js';
import { ArchiveCustomerUseCase } from '../../../src/modules/customers/application/useCases/archiveCustomer.useCase.js';
import { CreateCustomerUseCase } from '../../../src/modules/customers/application/useCases/createCustomer.useCase.js';
import { GetCustomerUseCase } from '../../../src/modules/customers/application/useCases/getCustomer.useCase.js';
import { ListCustomersUseCase } from '../../../src/modules/customers/application/useCases/listCustomers.useCase.js';
import { RestoreCustomerUseCase } from '../../../src/modules/customers/application/useCases/restoreCustomer.useCase.js';
import { UpdateCustomerUseCase } from '../../../src/modules/customers/application/useCases/updateCustomer.useCase.js';
import { PrismaCustomerUnitOfWork } from '../../../src/modules/customers/infrastructure/transactions/prismaCustomerUnitOfWork.js';

const url = process.env.PAYMENT_INTEGRATION_DATABASE_URL;
const suite = url === undefined ? describe.skip : describe;

function disposableUrl(): string {
  if (!url) throw new Error('Missing disposable integration database URL');
  const parsed = new URL(url);
  if (parsed.protocol !== 'postgresql:' || !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      parsed.pathname !== '/bom_trato_ci' || parsed.username !== 'bom_trato_ci' ||
      parsed.searchParams.get('schema') !== 'public') {
    throw new Error('Customer tests require disposable local bom_trato_ci database');
  }
  return url;
}

suite('customer persistence and tenant isolation (disposable PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: CustomerApplicationService;
  const users: string[] = [];
  const organizations: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ url: disposableUrl() });

    await prisma.$connect();
    service = new CustomerApplicationService(new PrismaCustomerUnitOfWork(prisma));
  });

  afterEach(async () => {
    if (!prisma) return;
    for (const organizationId of organizations.splice(0)) {
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organizationTrial.deleteMany({ where: { organizationId } });
      await prisma.organizationMember.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function organization() {
    const now = new Date();

    const owner = await prisma.user.create({ data: {
      name: 'Fixture owner',
      email: randomUUID() + '@example.invalid',
      emailVerifiedAt: now,
    } });
    users.push(owner.id);

    const org = await prisma.organization.create({ data: {
      name: 'Fixture organization',
      ownerId: owner.id,
      setupCompletedAt: now
    } });
    organizations.push(org.id);

    await prisma.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER' } });
    await prisma.organizationTrial.create({ data: {
      organizationId: org.id,
      ownerId: owner.id,
      startsAt: new Date(now.getTime() - 60000),
      expiresAt: new Date(now.getTime() + 86400000),
    } });

    return { organizationId: org.id, userId: owner.id };
  }
  const data = {
    name: 'Fixture customer',
    email: 'fixture@example.invalid',
    phone: '34999991234'
  };

  it('allows the same normalized email in different organizations but never cross-tenant reads or edits', async () => {
    const first = await organization();
    const second = await organization();
    const create = new CreateCustomerUseCase(service);

    const a = await create.execute(first, data);
    const b = await create.execute(second, data);

    expect(a.id).not.toBe(b.id);

    const get = new GetCustomerUseCase(service);
    const update = new UpdateCustomerUseCase(service);

    await expect(get.execute({ ...second, customerId: a.id })).rejects.toThrow('CUSTOMER_NOT_FOUND');
    await expect(update.execute({ ...second, customerId: a.id }, { name: 'Other customer' })).rejects.toThrow('CUSTOMER_NOT_FOUND');
    await expect(get.execute({ ...first, userId: second.userId, customerId: a.id })).rejects.toThrow('MEMBER_REQUIRED');

    const page = await new ListCustomersUseCase(service).execute(second, { page: 1, limit: 10, status: 'ACTIVE' });

    expect(page.items.map((item) => item.id)).toEqual([b.id]);
    expect(await get.execute({ ...first, customerId: a.id })).toMatchObject({ name: data.name });
  });

  it('serializes same-organization duplicate customer creation and keeps the email unique', async () => {
    const actor = await organization();
    const create = new CreateCustomerUseCase(service);

    const results = await Promise.allSettled([
      create.execute(actor, data),
      create.execute(actor, { ...data, email: ' FIXTURE@example.invalid ' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);

    const rejected = results.find((result) => result.status === 'rejected');

    expect(rejected?.reason).toMatchObject({ code: 'CUSTOMER_EMAIL_ALREADY_EXISTS' });
    expect(await prisma.customer.count({ where: { organizationId: actor.organizationId } })).toBe(1);
  }, 30000);

  it('preserves archived data, excludes it from active listings and permits edits after restore', async () => {
    const actor = await organization();
    const item = await new CreateCustomerUseCase(service).execute(actor, data);
    const params = { ...actor, customerId: item.id };

    await new ArchiveCustomerUseCase(service).execute(params);

    await expect(new UpdateCustomerUseCase(service).execute(params, { name: 'Updated customer' })).rejects.toThrow('CUSTOMER_ARCHIVED');

    const list = new ListCustomersUseCase(service);

    expect((await list.execute(actor, { page: 1, limit: 10, status: 'ACTIVE' })).items).toHaveLength(0);
    expect((await list.execute(actor, {
      page: 1,
      limit: 10,
      status: 'ARCHIVED'
    })).items.map((item) => item.id)).toEqual([item.id]);

    await new RestoreCustomerUseCase(service).execute(params);

    expect(await new UpdateCustomerUseCase(service).execute(params, { name: 'Updated customer' })).toMatchObject({
      name: 'Updated customer',
      archivedAt: null
    });
  });
});
