import { ApiProperty } from '@nestjs/swagger';

import { ServiceUnit } from '../../../../../../generated/prisma/enums.js';
import type {
  PublicWorkOrderAcceptance,
  PublicWorkOrderAcceptanceReceipt,
  WorkOrderAcceptanceReceipt,
  WorkOrderAcceptanceResult,
} from '../../../../application/types/workOrderAcceptance.types.js';
import type { WorkOrderAcceptanceSnapshot } from '../../../../domain/entities/workOrderAcceptance.entity.js';

export class PublicWorkOrderAcceptanceReceiptResponseDto implements PublicWorkOrderAcceptanceReceipt {
  @ApiProperty({ type: Date })
  acceptedAt!: Date;

  @ApiProperty({ type: Date })
  completedAt!: Date;
}

export class PublicWorkOrderAcceptanceResponseDto implements PublicWorkOrderAcceptance {
  @ApiProperty()
  canAccept!: boolean;

  @ApiProperty({ type: String, nullable: true })
  snapshotHash!: string | null;

  @ApiProperty()
  consentVersion!: string;

  @ApiProperty()
  consentText!: string;

  @ApiProperty({ type: PublicWorkOrderAcceptanceReceiptResponseDto, nullable: true })
  receipt!: PublicWorkOrderAcceptanceReceiptResponseDto | null;
}

export class WorkOrderAcceptanceSnapshotItemResponseDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ServiceUnit })
  unit!: ServiceUnit;

  @ApiProperty()
  quantityInThousandths!: number;

  @ApiProperty()
  unitAmountInCents!: number;

  @ApiProperty()
  totalInCents!: number;

  @ApiProperty()
  position!: number;
}

export class WorkOrderAcceptanceSnapshotDetailsResponseDto {
  @ApiProperty()
  title!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  subtotalInCents!: number;

  @ApiProperty()
  discountInCents!: number;

  @ApiProperty()
  totalInCents!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: [WorkOrderAcceptanceSnapshotItemResponseDto] })
  items!: WorkOrderAcceptanceSnapshotItemResponseDto[];
}

export class WorkOrderAcceptanceSnapshotResponseDto implements WorkOrderAcceptanceSnapshot {
  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ type: WorkOrderAcceptanceSnapshotDetailsResponseDto })
  workOrder!: WorkOrderAcceptanceSnapshotDetailsResponseDto;
}

export class WorkOrderAcceptanceReceiptResponseDto
  extends PublicWorkOrderAcceptanceReceiptResponseDto
  implements WorkOrderAcceptanceReceipt
{
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  signerName!: string;

  @ApiProperty()
  workOrderVersion!: number;

  @ApiProperty()
  consentVersion!: string;

  @ApiProperty()
  consentText!: string;

  @ApiProperty()
  snapshotHash!: string;

  @ApiProperty({ type: WorkOrderAcceptanceSnapshotResponseDto })
  snapshot!: WorkOrderAcceptanceSnapshotResponseDto;
}

export class WorkOrderAcceptanceResponseDto implements WorkOrderAcceptanceResult {
  @ApiProperty({ type: WorkOrderAcceptanceReceiptResponseDto, nullable: true })
  receipt!: WorkOrderAcceptanceReceiptResponseDto | null;
}
