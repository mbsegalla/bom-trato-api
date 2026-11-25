import { describe, expect, it, vi } from 'vitest';

import type { PrivateObjectStorage } from '../../../../shared/storage/privateObjectStorage.port.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { WorkOrderPhoto, WorkOrderPhotoProps } from '../../domain/entities/workOrderPhoto.entity.js';
import type { WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import { WorkOrderPhotoRepository } from '../../domain/repositories/workOrderPhoto.repository.js';
import { NodeWorkOrderShareSecurity } from '../../infrastructure/security/nodeWorkOrderShareSecurity.js';
import type { PublicWorkOrderUnitOfWork } from '../ports/publicWorkOrderUnitOfWork.port.js';
import type { WorkOrderPhotoImageProcessor } from '../ports/workOrderPhotoImage.port.js';
import type { WorkOrderPhotoUnitOfWork } from '../ports/workOrderPhotoUnitOfWork.port.js';
import { WorkOrderPhotoApplicationService } from '../services/workOrderPhotoApplicationService.service.js';

import { DeleteWorkOrderPhotoUseCase } from './deleteWorkOrderPhoto.useCase.js';
import { GetPublicWorkOrderPhotoContentUseCase } from './getPublicWorkOrderPhotoContent.useCase.js';
import { GetWorkOrderPhotoContentUseCase } from './getWorkOrderPhotoContent.useCase.js';
import { ListWorkOrderPhotosUseCase } from './listWorkOrderPhotos.useCase.js';
import { UpdateWorkOrderPhotoUseCase } from './updateWorkOrderPhoto.useCase.js';
import { UploadWorkOrderPhotoUseCase } from './uploadWorkOrderPhoto.useCase.js';

const params = { organizationId: 'organization', workOrderId: 'work-order', userId: 'member' };
const upload = { buffer: Buffer.from('source'), size: 6, mimeType: 'image/jpeg' };
const input = { stage: 'BEFORE', caption: '  Antes do serviço  ' } as const;

function makePhoto(overrides: Partial<WorkOrderPhotoProps> = {}): WorkOrderPhotoProps {
  return {
    id: 'photo',
    organizationId: params.organizationId,
    workOrderId: params.workOrderId,
    objectKey: 'private/key.webp',
    stage: 'BEFORE',
    caption: null,
    visibleInPortal: false,
    width: 800,
    height: 600,
    sizeInBytes: 3,
    version: 1,
    createdById: params.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

class MemoryPhotoRepository extends WorkOrderPhotoRepository {
  photos: WorkOrderPhotoProps[] = [];
  capacity = 0;

  async list(): Promise<WorkOrderPhotoProps[]> {
    return structuredClone(this.photos);
  }

  async count(): Promise<number> {
    return this.photos.length + this.capacity;
  }

  async findById(id: string): Promise<WorkOrderPhotoProps | null> {
    return structuredClone(this.photos.find((photo) => photo.id === id) ?? null);
  }

  async create(photo: WorkOrderPhoto): Promise<void> {
    this.photos.push(photo.snapshot());
  }

  async save(photo: WorkOrderPhoto, expectedVersion: number): Promise<void> {
    const state = photo.snapshot();
    const index = this.photos.findIndex((stored) => stored.id === state.id && stored.version === expectedVersion);

    if (index === -1) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_VERSION_CONFLICT');
    }

    this.photos[index] = state;
  }

  async delete(id: string, expectedVersion: number): Promise<void> {
    const index = this.photos.findIndex((photo) => photo.id === id && photo.version === expectedVersion);

    if (index === -1) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_VERSION_CONFLICT');
    }

    this.photos.splice(index, 1);
  }
}

function setup() {
  const photos = new MemoryPhotoRepository();
  const access: OrganizationAccessContext = {
    isMember: true,
    verified: true,
    hasPlatformAccess: true,
    source: 'SUBSCRIPTION',
    billingNeedsReconciliation: false,
  };
  const context = {
    access,
    photos,
    workOrderExists: async () => true,
  };
  const unitOfWork: WorkOrderPhotoUnitOfWork = {
    read: async (actor, operation) =>
      operation({
        ...context,
        access: { ...access, isMember: access.isMember && actor.organizationId === params.organizationId },
        workOrderExists: async () => actor.workOrderId === params.workOrderId,
      }),
    run: async (actor, operation) =>
      operation({
        ...context,
        access: { ...access, isMember: access.isMember && actor.organizationId === params.organizationId },
        workOrderExists: async () => actor.workOrderId === params.workOrderId,
      }),
  };
  const processor = new WorkOrderPhotoApplicationService(unitOfWork);
  const storage = {
    put: vi.fn<PrivateObjectStorage['put']>().mockResolvedValue(undefined),
    get: vi.fn<PrivateObjectStorage['get']>().mockResolvedValue(new Uint8Array([1, 2, 3])),
    delete: vi.fn<PrivateObjectStorage['delete']>().mockResolvedValue(undefined),
  };
  const imageProcessor = {
    process: vi.fn<WorkOrderPhotoImageProcessor['process']>().mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      width: 800,
      height: 600,
    }),
  };

  return { photos, access, processor, storage, imageProcessor, unitOfWork };
}

describe('work order photo management', () => {
  it('uploads privately and returns only safe metadata', async () => {
    const fixture = setup();
    const result = await new UploadWorkOrderPhotoUseCase(
      fixture.processor,
      fixture.imageProcessor,
      fixture.storage,
    ).execute(params, input, upload);

    expect(result).toMatchObject({ caption: 'Antes do serviço', visibleInPortal: false, version: 1 });
    expect(result).not.toHaveProperty('objectKey');
    expect(result).not.toHaveProperty('createdById');
    expect(result).not.toHaveProperty('organizationId');
    expect(fixture.storage.put).toHaveBeenCalledOnce();
    expect(fixture.storage.put.mock.calls[0][0].key).toContain(
      `organizations/${params.organizationId}/work-orders/${params.workOrderId}/photos/`,
    );
    expect(fixture.storage.put.mock.calls[0][0]).toMatchObject({
      contentType: 'image/webp',
      body: Buffer.from([1, 2, 3]),
    });
  });

  it.each(['isMember', 'verified', 'hasPlatformAccess'] as const)(
    'rejects upload before decoding or storage when %s is false',
    async (field) => {
      const fixture = setup();
      fixture.access[field] = false;

      await expect(
        new UploadWorkOrderPhotoUseCase(fixture.processor, fixture.imageProcessor, fixture.storage).execute(
          params,
          input,
          upload,
        ),
      ).rejects.toThrow();
      expect(fixture.imageProcessor.process).not.toHaveBeenCalled();
      expect(fixture.storage.put).not.toHaveBeenCalled();
    },
  );

  it('rechecks capacity under the write transaction and removes an uncommitted object', async () => {
    const fixture = setup();
    fixture.photos.capacity = 19;
    fixture.storage.put.mockImplementation(async () => {
      fixture.photos.capacity = 20;
    });

    await expect(
      new UploadWorkOrderPhotoUseCase(fixture.processor, fixture.imageProcessor, fixture.storage).execute(
        params,
        input,
        upload,
      ),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_PHOTO_LIMIT_REACHED' });
    expect(fixture.photos.photos).toHaveLength(0);
    expect(fixture.storage.delete).toHaveBeenCalledWith(fixture.storage.put.mock.calls[0][0].key);
  });

  it('rechecks membership after storage and compensates when access has been revoked', async () => {
    const fixture = setup();
    fixture.storage.put.mockImplementation(async () => {
      fixture.access.isMember = false;
    });

    await expect(
      new UploadWorkOrderPhotoUseCase(fixture.processor, fixture.imageProcessor, fixture.storage).execute(
        params,
        input,
        upload,
      ),
    ).rejects.toMatchObject({ code: 'MEMBER_REQUIRED' });
    expect(fixture.storage.delete).toHaveBeenCalledOnce();
    expect(fixture.photos.photos).toHaveLength(0);
  });

  it('preserves a referenced object when the database commit acknowledgement is lost', async () => {
    const fixture = setup();
    const run = fixture.unitOfWork.run.bind(fixture.unitOfWork);
    fixture.unitOfWork.run = async (actor, operation) => {
      await run(actor, operation);

      throw new Error('Connection lost after commit');
    };

    await expect(
      new UploadWorkOrderPhotoUseCase(fixture.processor, fixture.imageProcessor, fixture.storage).execute(
        params,
        input,
        upload,
      ),
    ).rejects.toThrow('Connection lost after commit');
    expect(fixture.photos.photos).toHaveLength(1);
    expect(fixture.storage.delete).not.toHaveBeenCalled();
  });

  it('stops at the limit before decoding and never writes invalid images', async () => {
    const fixture = setup();
    const useCase = new UploadWorkOrderPhotoUseCase(fixture.processor, fixture.imageProcessor, fixture.storage);
    fixture.photos.capacity = 20;

    await expect(useCase.execute(params, input, upload)).rejects.toMatchObject({
      code: 'WORK_ORDER_PHOTO_LIMIT_REACHED',
    });
    expect(fixture.imageProcessor.process).not.toHaveBeenCalled();

    fixture.photos.capacity = 0;
    fixture.imageProcessor.process.mockRejectedValue(new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO'));

    await expect(useCase.execute(params, input, upload)).rejects.toMatchObject({ code: 'INVALID_WORK_ORDER_PHOTO' });
    expect(fixture.storage.put).not.toHaveBeenCalled();
  });

  it('keeps storage errors out of responses and does not create metadata', async () => {
    const fixture = setup();
    fixture.storage.put.mockRejectedValue(new Error('private credentials and endpoint'));

    await expect(
      new UploadWorkOrderPhotoUseCase(fixture.processor, fixture.imageProcessor, fixture.storage).execute(
        params,
        input,
        upload,
      ),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_PHOTO_STORAGE_FAILED' });
    expect(fixture.photos.photos).toHaveLength(0);
  });

  it('does not expose another organization or work order through list or content', async () => {
    const fixture = setup();
    fixture.photos.photos = [makePhoto()];
    const list = new ListWorkOrderPhotosUseCase(fixture.processor);
    const content = new GetWorkOrderPhotoContentUseCase(fixture.processor, fixture.storage);

    await expect(list.execute({ ...params, organizationId: 'other' })).rejects.toMatchObject({
      code: 'MEMBER_REQUIRED',
    });
    await expect(content.execute({ ...params, workOrderId: 'other', photoId: 'photo' })).rejects.toMatchObject({
      code: 'WORK_ORDER_NOT_FOUND',
    });
    expect(fixture.storage.get).not.toHaveBeenCalled();
  });

  it('checks the photo version and permits privacy revocation without an active subscription', async () => {
    const fixture = setup();
    fixture.photos.photos = [makePhoto({ visibleInPortal: true })];
    const useCase = new UpdateWorkOrderPhotoUseCase(fixture.processor);
    const change = { ...params, photoId: 'photo', version: 1 };

    await expect(useCase.execute({ ...change, version: 2 }, { visibleInPortal: false })).rejects.toMatchObject({
      code: 'WORK_ORDER_PHOTO_VERSION_CONFLICT',
    });

    fixture.access.hasPlatformAccess = false;

    await expect(useCase.execute(change, { stage: 'AFTER' })).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(useCase.execute(change, { visibleInPortal: false })).resolves.toMatchObject({
      visibleInPortal: false,
      version: 2,
    });
    await expect(useCase.execute({ ...change, version: 2 }, { visibleInPortal: true })).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('removes database access before storage cleanup and preserves version conflict protection', async () => {
    const fixture = setup();
    fixture.photos.photos = [makePhoto()];
    fixture.access.hasPlatformAccess = false;
    const useCase = new DeleteWorkOrderPhotoUseCase(fixture.processor, fixture.storage);
    const change = { ...params, photoId: 'photo', version: 1 };

    await expect(useCase.execute({ ...change, version: 2 })).rejects.toMatchObject({
      code: 'WORK_ORDER_PHOTO_VERSION_CONFLICT',
    });
    expect(fixture.storage.delete).not.toHaveBeenCalled();

    fixture.storage.delete.mockImplementation(async () => {
      expect(fixture.photos.photos).toHaveLength(0);
      throw new Error('Storage temporarily unavailable');
    });

    await expect(useCase.execute(change)).resolves.toBeUndefined();
    expect(fixture.photos.photos).toHaveLength(0);
  });

  it('checks private access again after downloading the object', async () => {
    const fixture = setup();
    fixture.photos.photos = [makePhoto()];
    fixture.storage.get.mockImplementation(async () => {
      fixture.access.isMember = false;

      return new Uint8Array([1, 2, 3]);
    });

    await expect(
      new GetWorkOrderPhotoContentUseCase(fixture.processor, fixture.storage).execute({ ...params, photoId: 'photo' }),
    ).rejects.toMatchObject({ code: 'MEMBER_REQUIRED' });
  });

  it('validates captions without persisting partial changes', async () => {
    const fixture = setup();
    fixture.photos.photos = [makePhoto()];

    await expect(
      new UpdateWorkOrderPhotoUseCase(fixture.processor).execute(
        { ...params, photoId: 'photo', version: 1 },
        { stage: 'AFTER', caption: 'a'.repeat(241) },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_ORDER_PHOTO_INPUT' });
    expect(fixture.photos.photos[0]).toMatchObject({ stage: 'BEFORE', version: 1 });
  });
});

function setupPublic() {
  const { storage } = setup();
  const photo = makePhoto({ visibleInPortal: true });
  const share: WorkOrderShareProps = {
    id: 'share',
    organizationId: params.organizationId,
    workOrderId: params.workOrderId,
    tokenHash: 'hash',
    createdById: params.userId,
    createdAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
  const unitOfWork: PublicWorkOrderUnitOfWork = {
    read: async (_hash, operation) =>
      operation({
        share: structuredClone(share),
        acceptances: { findForCompletion: async () => null },
        findPlatformAccess: async () => ({
          hasAccess: true,
          source: 'SUBSCRIPTION',
          billingNeedsReconciliation: false,
        }),
        findWorkOrder: async () => null,
        findPhoto: async (id) => (id === photo.id ? structuredClone(photo) : null),
      }),
    run: async () => {
      throw new Error('Photo reads must not start a write transaction');
    },
  };
  const useCase = new GetPublicWorkOrderPhotoContentUseCase(unitOfWork, new NodeWorkOrderShareSecurity(), storage);

  return { photo, share, storage, useCase, token: 'a'.repeat(64) };
}

describe('public work order photo access', () => {
  it.each(['hidden', 'revoked', 'expired', 'other organization', 'other work order'])(
    'rejects %s photos without reading storage',
    async (scenario) => {
      const fixture = setupPublic();

      if (scenario === 'hidden') {
        fixture.photo.visibleInPortal = false;
      } else if (scenario === 'revoked') {
        fixture.share.revokedAt = new Date();
      } else if (scenario === 'expired') {
        fixture.share.expiresAt = new Date(Date.now() - 1);
      } else if (scenario === 'other organization') {
        fixture.photo.organizationId = 'other';
      } else {
        fixture.photo.workOrderId = 'other';
      }

      await expect(fixture.useCase.execute(fixture.token, 'photo')).rejects.toMatchObject({
        code: 'WORK_ORDER_SHARE_NOT_FOUND',
      });
      expect(fixture.storage.get).not.toHaveBeenCalled();
    },
  );

  it('returns only binary data for a published photo and active token', async () => {
    const fixture = setupPublic();

    await expect(fixture.useCase.execute(fixture.token, 'photo')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(fixture.useCase.execute('invalid', 'photo')).rejects.toMatchObject({
      code: 'WORK_ORDER_SHARE_NOT_FOUND',
    });
    await expect(fixture.useCase.execute(fixture.token, 'missing')).rejects.toMatchObject({
      code: 'WORK_ORDER_SHARE_NOT_FOUND',
    });
  });

  it.each(['hidden', 'revoked', 'expired'])(
    'rejects access when the photo becomes %s during storage I/O',
    async (scenario) => {
      const fixture = setupPublic();
      fixture.storage.get.mockImplementation(async () => {
        if (scenario === 'hidden') {
          fixture.photo.visibleInPortal = false;
        } else if (scenario === 'revoked') {
          fixture.share.revokedAt = new Date();
        } else {
          fixture.share.expiresAt = new Date(Date.now() - 1);
        }

        return new Uint8Array([1, 2, 3]);
      });

      await expect(fixture.useCase.execute(fixture.token, 'photo')).rejects.toMatchObject({
        code: 'WORK_ORDER_SHARE_NOT_FOUND',
      });
    },
  );
});
