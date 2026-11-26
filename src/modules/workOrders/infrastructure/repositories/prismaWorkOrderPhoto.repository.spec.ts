import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderPhoto } from '../../domain/entities/workOrderPhoto.entity.js';

import { PrismaWorkOrderPhotoRepository, workOrderPhotoSelect } from './prismaWorkOrderPhoto.repository.js';

const scope = { organizationId: 'org', workOrderId: 'order' };
const now = new Date('2026-01-01T12:00:00Z');
const photo = WorkOrderPhoto.create(
  {
    ...scope,
    id: 'photo',
    objectKey: 'fixture/private/photo.webp',
    stage: 'BEFORE',
    caption: null,
    width: 800,
    height: 600,
    sizeInBytes: 1000,
    createdById: 'owner',
  },
  now,
);

function fixture() {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const findFirst = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaWorkOrderPhotoRepository(
    {
      workOrderPhoto: { findMany, count, findFirst, create, updateMany, deleteMany },
    } as unknown as Prisma.TransactionClient,
    scope.organizationId,
    scope.workOrderId,
  );

  return { repository, findMany, count, findFirst, create, updateMany, deleteMany };
}

describe('PrismaWorkOrderPhotoRepository', () => {
  it('scopes all photo reads and counts to the requested work order and tenant', async () => {
    const f = fixture();
    f.findMany.mockResolvedValue([photo.snapshot()]);
    f.count.mockResolvedValue(1);
    f.findFirst.mockResolvedValue(photo.snapshot());
    expect(await f.repository.list()).toEqual([photo.snapshot()]);
    expect(await f.repository.count()).toBe(1);
    expect(await f.repository.findById('photo')).toEqual(photo.snapshot());
    expect(f.findMany).toHaveBeenCalledWith({
      where: scope,
      select: workOrderPhotoSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(f.count).toHaveBeenCalledWith({ where: scope });
    expect(f.findFirst).toHaveBeenCalledWith({ where: { ...scope, id: 'photo' }, select: workOrderPhotoSelect });
  });

  it.each([{ organizationId: 'other' }, { workOrderId: 'other' }])(
    'rejects foreign photo writes: %j',
    async (patch) => {
      const f = fixture();
      const foreign = WorkOrderPhoto.restore({ ...photo.snapshot(), ...patch });
      await expect(f.repository.create(foreign)).rejects.toThrow('WORK_ORDER_PHOTO_NOT_FOUND');
      await expect(f.repository.save(foreign, 1)).rejects.toThrow('WORK_ORDER_PHOTO_NOT_FOUND');
      expect(f.create).not.toHaveBeenCalled();
      expect(f.updateMany).not.toHaveBeenCalled();
    },
  );

  it('persists only mutable photo fields using the original version and tenant scope', async () => {
    const f = fixture();
    const updated = WorkOrderPhoto.restore(photo.snapshot());
    await f.repository.create(updated);
    updated.update(1, { stage: 'AFTER', caption: 'New caption', visibleInPortal: true }, now);
    await f.repository.save(updated, 1);
    await f.repository.delete('photo', 2);
    expect(f.create).toHaveBeenCalledWith({ data: photo.snapshot() });
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { ...scope, id: 'photo', version: 1 },
      data: { stage: 'AFTER', caption: 'New caption', visibleInPortal: true, version: 2, updatedAt: now },
    });
    expect(f.deleteMany).toHaveBeenCalledWith({ where: { ...scope, id: 'photo', version: 2 } });
  });

  it.each([0, 2])('rejects a write or deletion affecting %s records', async (count) => {
    const f = fixture();
    f.updateMany.mockResolvedValue({ count });
    f.deleteMany.mockResolvedValue({ count });
    await expect(f.repository.save(photo, 1)).rejects.toThrow('WORK_ORDER_PHOTO_VERSION_CONFLICT');
    await expect(f.repository.delete('photo', 1)).rejects.toThrow('WORK_ORDER_PHOTO_VERSION_CONFLICT');
  });
});
