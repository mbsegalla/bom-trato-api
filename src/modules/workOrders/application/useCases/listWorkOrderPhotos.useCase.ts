import { toWorkOrderPhotoView } from '../mappers/workOrderPhoto.mapper.js';
import type { WorkOrderPhotoApplicationService } from '../services/workOrderPhotoApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderPhotoView } from '../types/workOrderPhoto.types.js';

export class ListWorkOrderPhotosUseCase {
  constructor(private readonly processor: WorkOrderPhotoApplicationService) {}

  execute(params: WorkOrderByIdParams): Promise<WorkOrderPhotoView[]> {
    return this.processor.read(params, async (context) => (await context.photos.list()).map(toWorkOrderPhotoView));
  }
}
