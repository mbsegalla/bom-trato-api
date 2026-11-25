import { randomUUID } from 'node:crypto';

import type { PrivateObjectStorage } from '../../../../shared/storage/privateObjectStorage.port.js';
import type { WorkOrderPhotoInput } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderPhoto } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import { toWorkOrderPhotoView } from '../mappers/workOrderPhoto.mapper.js';
import type { WorkOrderPhotoImageProcessor, WorkOrderPhotoUpload } from '../ports/workOrderPhotoImage.port.js';
import type { WorkOrderPhotoApplicationService } from '../services/workOrderPhotoApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderPhotoView } from '../types/workOrderPhoto.types.js';

export class UploadWorkOrderPhotoUseCase {
  constructor(
    private readonly processor: WorkOrderPhotoApplicationService,
    private readonly imageProcessor: WorkOrderPhotoImageProcessor,
    private readonly storage: PrivateObjectStorage,
  ) {}

  async execute(
    params: WorkOrderByIdParams,
    input: WorkOrderPhotoInput,
    upload: WorkOrderPhotoUpload,
  ): Promise<WorkOrderPhotoView> {
    await this.processor.read(
      params,
      async (context) => WorkOrderPhoto.assertCapacity(await context.photos.count()),
      true,
    );

    const image = await this.imageProcessor.process(upload);
    const id = randomUUID();
    const objectKey = `organizations/${params.organizationId}/work-orders/${params.workOrderId}/photos/${id}.webp`;
    const photo = WorkOrderPhoto.create(
      {
        id,
        organizationId: params.organizationId,
        workOrderId: params.workOrderId,
        objectKey,
        stage: input.stage,
        caption: input.caption ?? null,
        width: image.width,
        height: image.height,
        sizeInBytes: image.buffer.length,
        createdById: params.userId,
      },
      new Date(),
    );

    try {
      await this.storage.put({ key: objectKey, body: image.buffer, contentType: 'image/webp' });
    } catch {
      await this.deleteSilently(objectKey);

      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_STORAGE_FAILED');
    }

    let insertCompleted = false;

    try {
      await this.processor.run(params, async (tx) => {
        WorkOrderPhoto.assertCapacity(await tx.photos.count());

        await tx.photos.create(photo);
        insertCompleted = true;
      });
    } catch (error: unknown) {
      if (!insertCompleted || (await this.isUncommitted(params, id))) {
        await this.deleteSilently(objectKey);
      }

      throw error;
    }

    return toWorkOrderPhotoView(photo.snapshot());
  }

  private async isUncommitted(params: WorkOrderByIdParams, photoId: string): Promise<boolean> {
    try {
      return await this.processor.read(params, async (context) => (await context.photos.findById(photoId)) === null);
    } catch {
      // An ambiguous commit must not delete an object that might still be referenced.
      return false;
    }
  }

  private async deleteSilently(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best effort cleanup. Private objects without metadata cannot be served.
    }
  }
}
