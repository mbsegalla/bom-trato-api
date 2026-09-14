import { ApiProperty, PickType } from '@nestjs/swagger';

import { ServiceUnit, WorkOrderStatus } from '../../../../../../generated/prisma/enums.js';

export class WorkOrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sourceQuoteItemId!: string;

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

export class WorkOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  quoteId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty({ type: String, nullable: true })
  customerEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerPhone!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  instructions!: string | null;

  @ApiProperty({ type: String, nullable: true })
  serviceAddress!: string | null;

  @ApiProperty({ type: String, nullable: true })
  executionNotes!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedToId!: string | null;

  @ApiProperty({ enum: WorkOrderStatus })
  status!: WorkOrderStatus;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  subtotalInCents!: number;

  @ApiProperty()
  discountInCents!: number;

  @ApiProperty()
  totalInCents!: number;

  @ApiProperty({ type: Date, nullable: true })
  scheduledStartAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  scheduledEndAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  canceledAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ format: 'uuid' })
  createdById!: string;

  @ApiProperty({ format: 'uuid' })
  updatedById!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;

  @ApiProperty({ type: [WorkOrderItemResponseDto] })
  items!: WorkOrderItemResponseDto[];
}

export class WorkOrderSummaryResponseDto extends PickType(WorkOrderResponseDto, [
  'id',
  'organizationId',
  'quoteId',
  'customerId',
  'customerName',
  'title',
  'assignedToId',
  'status',
  'currency',
  'totalInCents',
  'scheduledStartAt',
  'scheduledEndAt',
  'version',
  'createdAt',
  'updatedAt',
] as const) {}

export class WorkOrdersResponseDto {
  @ApiProperty({ type: [WorkOrderSummaryResponseDto] })
  items!: WorkOrderSummaryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class WorkOrderStatusHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workOrderId!: string;

  @ApiProperty({ enum: WorkOrderStatus, nullable: true })
  fromStatus!: WorkOrderStatus | null;

  @ApiProperty({ enum: WorkOrderStatus })
  toStatus!: WorkOrderStatus;

  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}
