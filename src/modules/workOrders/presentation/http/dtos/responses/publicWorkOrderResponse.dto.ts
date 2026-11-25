import { ApiProperty } from '@nestjs/swagger';

import { ServiceUnit, WorkOrderStatus } from '../../../../../../generated/prisma/enums.js';
import type {
  PublicWorkOrderDetails,
  PublicWorkOrderItem,
  PublicWorkOrderOrganization,
  PublicWorkOrderResult,
} from '../../../../application/types/publicWorkOrder.types.js';
import type { PublicWorkOrderFinancial } from '../../../../domain/policies/publicWorkOrderFinancial.policy.js';
import type { PublicWorkOrderTimelineEvent } from '../../../../domain/policies/publicWorkOrderTimeline.policy.js';
import { PublicWorkOrderTimelineEventType } from '../../../../domain/policies/publicWorkOrderTimeline.policy.js';

import { PublicWorkOrderPhotoResponseDto } from './workOrderPhotoResponse.dto.js';

export class PublicWorkOrderOrganizationResponseDto implements PublicWorkOrderOrganization {
  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
  })
  logoUrl!: string | null;
}

export class PublicWorkOrderItemResponseDto implements PublicWorkOrderItem {
  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
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

export class PublicWorkOrderDetailsResponseDto implements PublicWorkOrderDetails {
  @ApiProperty()
  title!: string;

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

  @ApiProperty({
    type: String,
    nullable: true,
  })
  responsibleName!: string | null;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  scheduledStartAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  scheduledEndAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  startedAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  completedAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  canceledAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({
    type: [PublicWorkOrderItemResponseDto],
  })
  items!: PublicWorkOrderItemResponseDto[];
}

export class PublicWorkOrderFinancialResponseDto implements PublicWorkOrderFinancial {
  @ApiProperty()
  receivedInCents!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Remaining contract amount, not necessarily due.',
  })
  remainingContractInCents!: number | null;

  @ApiProperty({
    description: 'Outstanding amount of non-canceled receivables.',
  })
  outstandingReceivablesInCents!: number;
}

export class PublicWorkOrderTimelineEventResponseDto implements PublicWorkOrderTimelineEvent {
  @ApiProperty({
    enum: PublicWorkOrderTimelineEventType,
    enumName: 'PublicWorkOrderTimelineEventType',
  })
  type!: PublicWorkOrderTimelineEventType;

  @ApiProperty({
    type: Date,
    description: 'Date and time when the event occurred.',
  })
  occurredAt!: Date;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Scheduled start time associated with a scheduling event.',
  })
  scheduledStartAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Scheduled end time associated with a scheduling event.',
  })
  scheduledEndAt!: Date | null;
}

export class PublicWorkOrderResponseDto implements PublicWorkOrderResult {
  @ApiProperty({
    type: PublicWorkOrderOrganizationResponseDto,
  })
  organization!: PublicWorkOrderOrganizationResponseDto;

  @ApiProperty({
    type: PublicWorkOrderDetailsResponseDto,
  })
  workOrder!: PublicWorkOrderDetailsResponseDto;

  @ApiProperty({
    type: PublicWorkOrderFinancialResponseDto,
    nullable: true,
  })
  financial!: PublicWorkOrderFinancialResponseDto | null;

  @ApiProperty({
    type: [PublicWorkOrderTimelineEventResponseDto],
    description: 'Public service events in chronological order.',
  })
  timeline!: PublicWorkOrderTimelineEventResponseDto[];

  @ApiProperty({ type: [PublicWorkOrderPhotoResponseDto] })
  photos!: PublicWorkOrderPhotoResponseDto[];

  @ApiProperty({ type: Date })
  generatedAt!: Date;

  @ApiProperty({ type: Date })
  expiresAt!: Date;
}
