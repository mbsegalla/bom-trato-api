import type { PrivateObjectStorage } from '../../../../shared/storage/privateObjectStorage.port.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import type { WorkOrderPhotoApplicationService } from '../services/workOrderPhotoApplicationService.service.js';
import type { WorkOrderPhotoByIdParams } from '../types/workOrderPhoto.types.js';

export class GetWorkOrderPhotoContentUseCase {
  constructor(
    private readonly processor: WorkOrderPhotoApplicationService,
    private readonly storage: PrivateObjectStorage,
  ) {}

  async execute(params: WorkOrderPhotoByIdParams): Promise<Uint8Array> {
    const key = await this.findKey(params);
    let bytes: Uint8Array;

    try {
      bytes = await this.storage.get(key);
    } catch {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_STORAGE_FAILED');
    }

    if ((await this.findKey(params)) !== key) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_NOT_FOUND');
    }

    return bytes;
  }

  private findKey(params: WorkOrderPhotoByIdParams): Promise<string> {
    return this.processor.read(params, async (context) => {
      const photo = await context.photos.findById(params.photoId);

      if (photo === null) {
        throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_NOT_FOUND');
      }

      return photo.objectKey;
    });
  }
}
