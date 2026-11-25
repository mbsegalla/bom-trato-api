import type { PrivateObjectStorage } from '../../../../shared/storage/privateObjectStorage.port.js';
import { WorkOrderPhoto } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import type { WorkOrderPhotoApplicationService } from '../services/workOrderPhotoApplicationService.service.js';
import type { ChangeWorkOrderPhotoParams } from '../types/workOrderPhoto.types.js';

export class DeleteWorkOrderPhotoUseCase {
  constructor(
    private readonly processor: WorkOrderPhotoApplicationService,
    private readonly storage: PrivateObjectStorage,
  ) {}

  async execute(params: ChangeWorkOrderPhotoParams): Promise<void> {
    const key = await this.processor.run(
      params,
      async (tx) => {
        const state = await tx.photos.findById(params.photoId);

        if (state === null) {
          throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_NOT_FOUND');
        }

        WorkOrderPhoto.restore(state).assertVersion(params.version);

        await tx.photos.delete(params.photoId, params.version);

        return state.objectKey;
      },
      false,
    );

    try {
      await this.storage.delete(key);
    } catch {
      // Metadata is authoritative: failed cleanup must not restore access to the photo.
    }
  }
}
