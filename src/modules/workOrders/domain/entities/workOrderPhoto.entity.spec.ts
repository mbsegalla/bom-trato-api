import { describe, expect, it } from 'vitest';

import { WorkOrderPhoto } from './workOrderPhoto.entity.js';
const now = new Date('2026-01-01T00:00:00Z');
const input = { id: 'photo', organizationId: 'org', workOrderId: 'order', objectKey: 'private/photo', stage: 'BEFORE' as const, caption: ' Test ', width: 600, height: 400, sizeInBytes: 1000, createdById: 'owner' };
describe('WorkOrderPhoto', () => {
  it('defaults private and requires an explicit versioned change for publication', () => {
    const photo = WorkOrderPhoto.create(input, now);
    expect(photo.snapshot()).toMatchObject({ caption: 'Test', visibleInPortal: false, version: 1 });
    photo.update(1, { visibleInPortal: true, caption: ' ' }, now);
    expect(photo.snapshot()).toMatchObject({ visibleInPortal: true, caption: null, version: 2, objectKey: input.objectKey });
    expect(() => photo.update(1, { visibleInPortal: false }, now)).toThrow('WORK_ORDER_PHOTO_VERSION_CONFLICT');
  });
  it('enforces caption and capacity boundaries and preserves terminal version', () => {
    expect(() => WorkOrderPhoto.create({ ...input, caption: 'a'.repeat(241) }, now)).toThrow('INVALID_WORK_ORDER_PHOTO_INPUT');
    expect(() => WorkOrderPhoto.assertCapacity(19)).not.toThrow();
    expect(() => WorkOrderPhoto.assertCapacity(20)).toThrow('WORK_ORDER_PHOTO_LIMIT_REACHED');
    const photo = WorkOrderPhoto.restore({ ...WorkOrderPhoto.create(input, now).snapshot(), version: 2147483647 });
    expect(() => photo.update(2147483647, { caption: 'Other' }, now)).toThrow('WORK_ORDER_PHOTO_VERSION_CONFLICT');
  });
});
