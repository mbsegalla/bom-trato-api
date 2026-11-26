import { describe, expect, it } from 'vitest';

import { WorkOrderAcceptance } from './workOrderAcceptance.entity.js';
import type { WorkOrderAcceptanceSnapshot } from './workOrderAcceptance.entity.js';
const now = new Date('2026-01-01T12:00:00Z');
const snapshot: WorkOrderAcceptanceSnapshot = { schemaVersion: 1, organizationName: 'Fixture', workOrder: { title: 'Service', currency: 'brl', subtotalInCents: 1000, discountInCents: 0, totalInCents: 1000, completedAt: now.toISOString(), version: 2, items: [] } };
const params = { id: 'acceptance', organizationId: 'org', workOrderId: 'order', shareId: 'share', snapshot };
const input = { snapshotHash: 'a'.repeat(64), signerName: ' Cliente   Teste ', consent: true as const, consentVersion: '1' };
describe('WorkOrderAcceptance', () => {
  it('normalizes the signer and binds replay to the original immutable evidence', () => {
    const acceptance = WorkOrderAcceptance.create(params, input, now);
    expect(acceptance.snapshot()).toMatchObject({ signerName: 'Cliente Teste', workOrderVersion: 2, consentVersion: '1', acceptedAt: now });
    expect(() => acceptance.assertReplay({ ...input, signerName: 'Cliente Teste' })).not.toThrow();
    expect(() => acceptance.assertReplay({ ...input, signerName: 'Other signer' })).toThrow('WORK_ORDER_ALREADY_ACCEPTED');
    expect(() => acceptance.assertReplay({ ...input, snapshotHash: 'b'.repeat(64) })).toThrow('WORK_ORDER_ALREADY_ACCEPTED');
    acceptance.snapshot().snapshot.workOrder.totalInCents = 1;
    expect(acceptance.snapshot().snapshot.workOrder.totalInCents).toBe(1000);
  });
  it('rejects outdated consent and future or invalid completion evidence', () => {
    expect(() => WorkOrderAcceptance.create(params, { ...input, consentVersion: '0' }, now)).toThrow('WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT');
    expect(() => WorkOrderAcceptance.create({ ...params, snapshot: { ...snapshot, workOrder: { ...snapshot.workOrder, completedAt: new Date(now.getTime() + 1).toISOString() } } }, input, now)).toThrow('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');
    expect(() => WorkOrderAcceptance.normalizeInput({ ...input, snapshotHash: 'invalid' })).toThrow('INVALID_WORK_ORDER_ACCEPTANCE_INPUT');
  });
  it('is current only for the same completed work order version and completion time', () => {
    const acceptance = WorkOrderAcceptance.create(params, input, now);
    const source = { id: 'order', organizationId: 'org', status: 'COMPLETED' as const, completedAt: now, version: 2 };
    expect(acceptance.isCurrentFor(source)).toBe(true);
    expect(acceptance.isCurrentFor({ ...source, version: 3 })).toBe(false);
    expect(acceptance.isCurrentFor({ ...source, organizationId: 'other' })).toBe(false);
    expect(acceptance.isCurrentFor({ ...source, completedAt: null })).toBe(false);
  });
});
