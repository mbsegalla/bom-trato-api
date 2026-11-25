import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { PrivateObjectStorage } from '../../shared/storage/privateObjectStorage.port.js';

import { WorkOrderPhotoImageProcessor } from './application/ports/workOrderPhotoImage.port.js';
import { WorkOrderPhotoUnitOfWork } from './application/ports/workOrderPhotoUnitOfWork.port.js';
import { WorkOrderPhotoApplicationService } from './application/services/workOrderPhotoApplicationService.service.js';
import { DeleteWorkOrderPhotoUseCase } from './application/useCases/deleteWorkOrderPhoto.useCase.js';
import { GetWorkOrderPhotoContentUseCase } from './application/useCases/getWorkOrderPhotoContent.useCase.js';
import { ListWorkOrderPhotosUseCase } from './application/useCases/listWorkOrderPhotos.useCase.js';
import { UpdateWorkOrderPhotoUseCase } from './application/useCases/updateWorkOrderPhoto.useCase.js';
import { UploadWorkOrderPhotoUseCase } from './application/useCases/uploadWorkOrderPhoto.useCase.js';
import { SharpWorkOrderPhotoImageProcessor } from './infrastructure/images/sharpWorkOrderPhotoImage.processor.js';
import { PrismaWorkOrderPhotoUnitOfWork } from './infrastructure/transactions/prismaWorkOrderPhotoUnitOfWork.js';
import { WorkOrderPhotosController } from './presentation/http/controllers/workOrderPhotos.controller.js';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [WorkOrderPhotosController],
  providers: [
    { provide: WorkOrderPhotoUnitOfWork, useClass: PrismaWorkOrderPhotoUnitOfWork },
    { provide: WorkOrderPhotoImageProcessor, useClass: SharpWorkOrderPhotoImageProcessor },
    {
      provide: WorkOrderPhotoApplicationService,
      useFactory: (unitOfWork: WorkOrderPhotoUnitOfWork) => new WorkOrderPhotoApplicationService(unitOfWork),
      inject: [WorkOrderPhotoUnitOfWork],
    },
    {
      provide: ListWorkOrderPhotosUseCase,
      useFactory: (processor: WorkOrderPhotoApplicationService) => new ListWorkOrderPhotosUseCase(processor),
      inject: [WorkOrderPhotoApplicationService],
    },
    {
      provide: UploadWorkOrderPhotoUseCase,
      useFactory: (
        processor: WorkOrderPhotoApplicationService,
        imageProcessor: WorkOrderPhotoImageProcessor,
        storage: PrivateObjectStorage,
      ) => new UploadWorkOrderPhotoUseCase(processor, imageProcessor, storage),
      inject: [WorkOrderPhotoApplicationService, WorkOrderPhotoImageProcessor, PrivateObjectStorage],
    },
    {
      provide: UpdateWorkOrderPhotoUseCase,
      useFactory: (processor: WorkOrderPhotoApplicationService) => new UpdateWorkOrderPhotoUseCase(processor),
      inject: [WorkOrderPhotoApplicationService],
    },
    {
      provide: DeleteWorkOrderPhotoUseCase,
      useFactory: (processor: WorkOrderPhotoApplicationService, storage: PrivateObjectStorage) =>
        new DeleteWorkOrderPhotoUseCase(processor, storage),
      inject: [WorkOrderPhotoApplicationService, PrivateObjectStorage],
    },
    {
      provide: GetWorkOrderPhotoContentUseCase,
      useFactory: (processor: WorkOrderPhotoApplicationService, storage: PrivateObjectStorage) =>
        new GetWorkOrderPhotoContentUseCase(processor, storage),
      inject: [WorkOrderPhotoApplicationService, PrivateObjectStorage],
    },
  ],
})
export class WorkOrderPhotosModule {}
