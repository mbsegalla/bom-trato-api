import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../../generated/prisma/client.js';
import { Customer } from '../../domain/entities/customer.entity.js';

import { PrismaCustomerRepository } from './prismaCustomer.repository.js';

const now = new Date('2026-01-01T00:00:00Z');
const organizationId = 'organization';
const customer = Customer.create(
  {
    id: 'customer',
    organizationId,
    name: 'Fixture customer',
    email: 'fixture@example.invalid',
  },
  now,
);
const state = customer.snapshot();

function fixture() {
  const create = vi.fn().mockResolvedValue(undefined);
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaCustomerRepository(
    {
      customer: { create, findFirst, findMany, updateMany },
    } as unknown as Prisma.TransactionClient,
    organizationId,
  );

  return { repository, create, findFirst, findMany, updateMany };
}

describe('PrismaCustomerRepository', () => {
  it('scopes identity and email lookups to the organization', async () => {
    const f = fixture();

    await f.repository.findById(state.id);
    await f.repository.findByEmail('fixture@example.invalid');

    expect(f.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: state.id, organizationId },
    });
    expect(f.findFirst).toHaveBeenNthCalledWith(2, {
      where: { organizationId, email: 'fixture@example.invalid' },
    });
  });

  it('rejects foreign customer writes before accessing persistence', async () => {
    const f = fixture();
    const foreign = Customer.restore({ ...state, organizationId: 'other' });

    await expect(f.repository.create(foreign)).rejects.toThrow('CUSTOMER_NOT_FOUND');
    await expect(f.repository.save(foreign)).rejects.toThrow('CUSTOMER_NOT_FOUND');

    expect(f.create).not.toHaveBeenCalled();
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('persists mutable fields without replacing the customer identity', async () => {
    const f = fixture();
    const archived = Customer.restore(state);
    archived.archive(now);

    await f.repository.create(customer);
    await f.repository.save(archived);

    expect(f.create).toHaveBeenCalledWith({ data: state });
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: state.id, organizationId },
      data: {
        name: state.name,
        email: state.email,
        phone: null,
        defaultServiceAddress: null,
        notes: null,
        archivedAt: now,
        updatedAt: now,
      },
    });
  });

  it('reports a missing record when no scoped customer was updated', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.save(customer)).rejects.toThrow('CUSTOMER_NOT_FOUND');
  });

  it('maps unique email conflicts on both create and update without masking unrelated failures', async () => {
    const f = fixture();
    const duplicate = new Prisma.PrismaClientKnownRequestError('Fixture duplicate', {
      code: 'P2002',
      clientVersion: 'fixture',
    });
    const failure = new Error('Fixture database failure');

    f.create.mockRejectedValueOnce(duplicate).mockRejectedValueOnce(failure);
    f.updateMany.mockRejectedValueOnce(duplicate).mockRejectedValueOnce(failure);

    await expect(f.repository.create(customer)).rejects.toThrow('CUSTOMER_EMAIL_ALREADY_EXISTS');
    await expect(f.repository.save(customer)).rejects.toThrow('CUSTOMER_EMAIL_ALREADY_EXISTS');
    await expect(f.repository.create(customer)).rejects.toBe(failure);
    await expect(f.repository.save(customer)).rejects.toBe(failure);
  });

  it('escapes search wildcards and paginates active customers in stable order', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([state, { ...state, id: 'next' }]);
    const contains = String.raw`100\%\_\\test`;
    const filter = { contains, mode: 'insensitive' };

    expect(
      await f.repository.list({ page: 2, limit: 1, status: 'ACTIVE', search: String.raw`  100%_\test  ` }),
    ).toEqual({ items: [state], page: 2, hasMore: true });

    expect(f.findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        archivedAt: null,
        OR: [{ name: filter }, { email: filter }, { phone: filter }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 2,
    });
  });

  it('selects archived records and does not apply search when absent', async () => {
    const f = fixture();

    await f.repository.list({ page: 1, limit: 10, status: 'ARCHIVED' });
    await f.repository.list({ page: 1, limit: 10, status: 'ALL' });

    expect(f.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { organizationId, archivedAt: { not: null } },
      }),
    );
    expect(f.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { organizationId },
      }),
    );
  });
});
