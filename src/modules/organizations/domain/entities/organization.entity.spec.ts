import { describe, expect, it } from 'vitest';

import { Organization } from './organization.entity.js';
import type { OrganizationBusinessDetails } from './organization.entity.js';

const create = () => Organization.create({ id: 'org', name: ' Empresa ', ownerId: 'owner' });
describe('Organization', () => {
  it('defaults to disabled automation and exposes a profile without ownership metadata', () => {
    const org = create();
    expect(org.profile()).toMatchObject({ name: 'Empresa', defaultReceivableDueDays: 7, autoQuoteFollowUpEnabled: false, autoWorkOrderReminderEnabled: false, autoReviewRequestEnabled: false, autoReceivableReminderEnabled: false });
    expect(org.profile()).not.toHaveProperty('ownerId');
    expect(org.isOwnedBy('owner')).toBe(true);
    expect(org.isOwnedBy('other')).toBe(false);
  });
  it('normalizes contact, document and address while preserving unmodified values', () => {
    const org = create();
    org.update({ email: ' USER@example.invalid ', phone: '+55 (34) 99999-1234', documentType: 'CPF', document: '123.456.789-01', state: ' mg ', postalCode: '38400-000', city: ' Uberlandia ', autoReviewRequestEnabled: true });
    expect(org.profile()).toMatchObject({ email: 'user@example.invalid', phone: '34999991234', document: '12345678901', state: 'MG', postalCode: '38400000', city: 'Uberlandia', autoReviewRequestEnabled: true });
    org.update({ email: null, documentType: null, document: null });
    expect(org.profile()).toMatchObject({ email: null, document: null, state: 'MG' });
  });
  it.each([
    [{ name: 'A' }, 'INVALID_ORGANIZATION_NAME'],
    [{ email: 'invalid' }, 'INVALID_ORGANIZATION_EMAIL'],
    [{ phone: '123' }, 'INVALID_ORGANIZATION_PHONE'],
    [{ documentType: 'CNPJ', document: '123' }, 'INVALID_ORGANIZATION_DOCUMENT'],
    [{ document: '12345678901' }, 'INVALID_ORGANIZATION_DOCUMENT'],
    [{ state: 'XX' }, 'INVALID_ORGANIZATION_STATE'],
    [{ postalCode: '123' }, 'INVALID_ORGANIZATION_POSTAL_CODE'],
    [{ defaultReceivableDueDays: -1 }, 'INVALID_ORGANIZATION_RECEIVABLE_DUE_DAYS'],
    [{ defaultReceivableDueDays: 366 }, 'INVALID_ORGANIZATION_RECEIVABLE_DUE_DAYS'],
    [{ defaultReceivableDueDays: 0.5 }, 'INVALID_ORGANIZATION_RECEIVABLE_DUE_DAYS'],
    [{}, 'EMPTY_ORGANIZATION_UPDATE'],
  ] as [Partial<OrganizationBusinessDetails>, string][])('rejects invalid update without changing stored profile %j', (patch, code) => {
    const org = create();
    const before = org.snapshot();
    expect(() => org.update(patch)).toThrow(code);
    expect(org.snapshot()).toEqual(before);
  });
  it('sets and removes an isolated logo key', () => {
    const org = create();
    expect(() => org.setLogo(' ')).toThrow('INVALID_ORGANIZATION_LOGO');
    org.setLogo(' fixture/logo ');
    expect(org.profile().logoKey).toBe('fixture/logo');
    org.removeLogo();
    expect(org.profile().logoKey).toBeNull();
  });
});
