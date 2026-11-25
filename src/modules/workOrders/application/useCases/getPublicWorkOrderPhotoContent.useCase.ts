import type { PrivateObjectStorage } from '../../../../shared/storage/privateObjectStorage.port.js';
import { WorkOrderShare } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';
import type { PublicWorkOrderUnitOfWork } from '../ports/publicWorkOrderUnitOfWork.port.js';
import type { WorkOrderShareSecurity } from '../ports/workOrderShareSecurity.port.js';

export class GetPublicWorkOrderPhotoContentUseCase {
  constructor(
    private readonly unitOfWork: PublicWorkOrderUnitOfWork,
    private readonly security: WorkOrderShareSecurity,
    private readonly storage: PrivateObjectStorage,
  ) {}

  async execute(token: string, photoId: string): Promise<Uint8Array> {
    const hash = this.security.hash(token);
    const key = await this.findKey(hash, photoId);
    let bytes: Uint8Array;

    try {
      bytes = await this.storage.get(key);
    } catch {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_STORAGE_FAILED');
    }

    if ((await this.findKey(hash, photoId)) !== key) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    return bytes;
  }

  private findKey(hash: string, photoId: string): Promise<string> {
    return this.unitOfWork.read(hash, async (context) => {
      const share = WorkOrderShare.restore(context.share);

      if (!share.isReadableAt(new Date())) {
        throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
      }

      const photo = await context.findPhoto(photoId);

      if (photo === null || !photo.visibleInPortal) {
        throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
      }

      share.assertReadable(photo.organizationId, photo.workOrderId, new Date());

      return photo.objectKey;
    });
  }
}
