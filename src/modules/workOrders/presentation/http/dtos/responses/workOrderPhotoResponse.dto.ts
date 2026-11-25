import { ApiProperty } from '@nestjs/swagger';

import { WorkOrderPhotoStage } from '../../../../../../generated/prisma/enums.js';
import type { PublicWorkOrderPhoto, WorkOrderPhotoView } from '../../../../application/types/workOrderPhoto.types.js';

export class PublicWorkOrderPhotoResponseDto implements PublicWorkOrderPhoto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: WorkOrderPhotoStage })
  stage!: WorkOrderPhotoStage;

  @ApiProperty({ type: String, nullable: true, maxLength: 240 })
  caption!: string | null;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class WorkOrderPhotoResponseDto extends PublicWorkOrderPhotoResponseDto implements WorkOrderPhotoView {
  @ApiProperty()
  visibleInPortal!: boolean;

  @ApiProperty()
  sizeInBytes!: number;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}
