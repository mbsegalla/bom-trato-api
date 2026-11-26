import { describe, expect, it } from 'vitest';

import { Customer } from './customer.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = { id: 'customer', organizationId: 'org', name: ' Cliente ', email: ' USER@EXAMPLE.INVALID ', notes: ' note ' };

describe('Customer', () => {
  it('normalizes input and supports explicit clearing of optional fields', () => {
    const customer = Customer.create(input, now);
    expect(customer.snapshot()).toMatchObject({ name: 'Cliente', email: 'user@example.invalid', notes: 'note' });
    customer.update({ notes: null }, now);
    expect(customer.snapshot().notes).toBeNull();
    expect(customer.snapshot().email).toBe('user@example.invalid');
  });

  it('rejects invalid name, email, phone and empty update', () => {
    expect(() => Customer.create({ ...input, name: ' ' }, now)).toThrow('INVALID_CUSTOMER_NAME');
    expect(() => Customer.create({ ...input, email: 'bad' }, now)).toThrow('INVALID_CUSTOMER_EMAIL');
    expect(() => Customer.create({ ...input, phone: '123' }, now)).toThrow('INVALID_CUSTOMER_PHONE');
    expect(() => Customer.create(input, now).update({}, now)).toThrow('EMPTY_CUSTOMER_UPDATE');
  });

  it('protects archived customers and restores editing only on unarchive', () => {
    const customer = Customer.create(input, now);
    customer.archive(now);
    customer.archive(new Date(now.getTime() + 1000));
    expect(customer.snapshot().archivedAt).toEqual(now);
    expect(() => customer.update({ name: 'Other' }, now)).toThrow('CUSTOMER_ARCHIVED');
    customer.unarchive(now);
    expect(() => customer.update({ name: 'Other' }, now)).not.toThrow();
  });
});
