import { ApiProperty } from '@nestjs/swagger';

import type {
  WorkOrderRecurrenceListItem,
  WorkOrderRecurrenceListView,
  WorkOrderRecurrenceView,
} from '../../../../application/types/workOrderRecurrence.types.js';
import type {
  WorkOrderRecurrenceSettings,
  WorkOrderRecurrenceUnit,
} from '../../../../domain/policies/workOrderRecurrence.policy.js';

export class WorkOrderRecurrenceDto implements WorkOrderRecurrenceSettings {
  @ApiProperty({ enum: ['DAY', 'WEEK', 'MONTH'] })
  intervalUnit!: WorkOrderRecurrenceUnit;

  @ApiProperty({ minimum: 1, maximum: 365 })
  intervalCount!: number;

  @ApiProperty({ type: String, format: 'date' })
  nextVisitOn!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class WorkOrderRecurrenceResponseDto implements WorkOrderRecurrenceView {
  @ApiProperty({ type: WorkOrderRecurrenceDto, nullable: true })
  recurrence!: WorkOrderRecurrenceDto | null;

  @ApiProperty()
  canConfigure!: boolean;

  @ApiProperty()
  customerArchived!: boolean;

  @ApiProperty({ type: String, format: 'date' })
  today!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  completedOn!: string | null;
}

export class WorkOrderRecurrenceListItemDto implements WorkOrderRecurrenceListItem {
  @ApiProperty({ format: 'uuid' })
  workOrderId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  customerArchived!: boolean;

  @ApiProperty({ type: WorkOrderRecurrenceDto })
  recurrence!: WorkOrderRecurrenceDto;
}

export class WorkOrderRecurrencesResponseDto implements WorkOrderRecurrenceListView {
  @ApiProperty({ type: [WorkOrderRecurrenceListItemDto] })
  items!: WorkOrderRecurrenceListItemDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;

  @ApiProperty({ type: String, format: 'date' })
  today!: string;

  @ApiProperty()
  canConfigure!: boolean;
}
