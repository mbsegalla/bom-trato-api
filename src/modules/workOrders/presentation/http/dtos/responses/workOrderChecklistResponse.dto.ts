import { ApiProperty } from '@nestjs/swagger';

import type {
  PublicWorkOrderChecklist,
  PublicWorkOrderChecklistItem,
  WorkOrderChecklistItemView,
  WorkOrderChecklistProgress,
  WorkOrderChecklistView,
} from '../../../../application/types/workOrderChecklist.types.js';
import { WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH } from '../../../../domain/entities/workOrderChecklistItem.entity.js';

export class PublicWorkOrderChecklistItemResponseDto implements PublicWorkOrderChecklistItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minLength: 1, maxLength: WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH })
  title!: string;

  @ApiProperty()
  completed!: boolean;

  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;
}

export class WorkOrderChecklistItemResponseDto
  extends PublicWorkOrderChecklistItemResponseDto
  implements WorkOrderChecklistItemView
{
  @ApiProperty({ minimum: 0 })
  position!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  completedById!: string | null;

  @ApiProperty()
  visibleInPortal!: boolean;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  version!: number;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class WorkOrderChecklistProgressResponseDto implements WorkOrderChecklistProgress {
  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  completed!: number;
}

export class WorkOrderChecklistResponseDto implements WorkOrderChecklistView {
  @ApiProperty({ type: [WorkOrderChecklistItemResponseDto] })
  items!: WorkOrderChecklistItemResponseDto[];

  @ApiProperty({ type: WorkOrderChecklistProgressResponseDto })
  progress!: WorkOrderChecklistProgressResponseDto;
}

export class PublicWorkOrderChecklistResponseDto implements PublicWorkOrderChecklist {
  @ApiProperty({ type: [PublicWorkOrderChecklistItemResponseDto] })
  items!: PublicWorkOrderChecklistItemResponseDto[];

  @ApiProperty({ type: WorkOrderChecklistProgressResponseDto })
  progress!: WorkOrderChecklistProgressResponseDto;
}
