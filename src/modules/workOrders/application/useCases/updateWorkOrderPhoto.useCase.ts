import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { UpdateWorkOrderPhotoInput } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderPhoto } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import { toWorkOrderPhotoView } from '../mappers/workOrderPhoto.mapper.js';
import type { WorkOrderPhotoApplicationService } from '../services/workOrderPhotoApplicationService.service.js';
import type { ChangeWorkOrderPhotoParams, WorkOrderPhotoView } from '../types/workOrderPhoto.types.js';

export class UpdateWorkOrderPhotoUseCase {
  constructor(private readonly processor: WorkOrderPhotoApplicationService) {}

  execute(params: ChangeWorkOrderPhotoParams, input: UpdateWorkOrderPhotoInput): Promise<WorkOrderPhotoView> {
    return this.processor.run(
      params,
      async (tx) => {
        const state = await tx.photos.findById(params.photoId);

        if (state === null) {
          throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_NOT_FOUND');
        }

        const hidesOnly =
          input.visibleInPortal === false &&
          (input.stage === undefined || input.stage === state.stage) &&
          (input.caption === undefined || WorkOrderPhoto.normalizeCaption(input.caption) === state.caption);

        if (!hidesOnly) {
          OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new WorkOrderError(code));
        }

        const photo = WorkOrderPhoto.restore(state);

        photo.update(params.version, input, new Date());

        await tx.photos.save(photo, params.version);

        return toWorkOrderPhotoView(photo.snapshot());
      },
      false,
    );
  }
}
