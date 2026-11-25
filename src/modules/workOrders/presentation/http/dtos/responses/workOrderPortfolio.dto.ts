import { ApiProperty } from '@nestjs/swagger';

import { WorkOrderPhotoStage } from '../../../../../../generated/prisma/enums.js';

import type {
  PortfolioManagementStatus,
  PortalPortfolioStatus,
} from '../../../../application/types/workOrderPortfolio.types.js';

export class PortalPortfolioPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  consented!: boolean;

  @ApiProperty()
  published!: boolean;
}

export class PortalPortfolioStatusDto implements PortalPortfolioStatus {
  @ApiProperty()
  canAuthorize!: boolean;

  @ApiProperty({ type: [PortalPortfolioPhotoDto] })
  photos!: PortalPortfolioPhotoDto[];
}

export class ManagementPortfolioPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: WorkOrderPhotoStage })
  stage!: WorkOrderPhotoStage;

  @ApiProperty()
  visibleInPortal!: boolean;

  @ApiProperty()
  consented!: boolean;

  @ApiProperty()
  published!: boolean;
}

export class ManagementPortfolioStatusDto implements PortfolioManagementStatus {
  @ApiProperty({ type: [ManagementPortfolioPhotoDto] })
  photos!: ManagementPortfolioPhotoDto[];
}
