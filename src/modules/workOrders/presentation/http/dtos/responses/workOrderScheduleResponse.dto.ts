import { ApiProperty } from '@nestjs/swagger';

import { WorkOrderStatus } from '../../../../../../generated/prisma/enums.js';

export class WorkOrderScheduleItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  serviceAddress!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedToId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  assignedToName!: string | null;

  @ApiProperty({ enum: WorkOrderStatus })
  status!: WorkOrderStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  scheduledStartAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  scheduledEndAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  late!: boolean;
}

export class WorkOrderScheduleResponseDto {
  @ApiProperty({ type: [WorkOrderScheduleItemResponseDto] })
  items!: WorkOrderScheduleItemResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  from!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  to!: Date;
}

export class WorkOrderScheduleHistoryItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  workOrderId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  fromAssignedToId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  toAssignedToId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fromStartAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fromEndAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  toStartAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  toEndAt!: Date | null;

  @ApiProperty({ enum: WorkOrderStatus })
  fromStatus!: WorkOrderStatus;

  @ApiProperty({ enum: WorkOrderStatus })
  toStatus!: WorkOrderStatus;

  @ApiProperty({ type: String, format: 'uuid' })
  actorId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class WorkOrderScheduleHistoryResponseDto {
  @ApiProperty({ type: [WorkOrderScheduleHistoryItemResponseDto] })
  items!: WorkOrderScheduleHistoryItemResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}
