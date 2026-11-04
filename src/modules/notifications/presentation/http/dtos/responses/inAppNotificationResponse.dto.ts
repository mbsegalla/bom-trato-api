import { ApiProperty } from '@nestjs/swagger';

import {
  AutomationEntityType,
  AutomationType,
  InAppNotificationType,
  NotificationStatus,
} from '../../../../../../generated/prisma/enums.js';

export class NotificationStreamTicketResponseDto {
  @ApiProperty()
  ticket!: string;

  @ApiProperty({ type: Date })
  expiresAt!: Date;
}

export class InAppNotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ enum: InAppNotificationType })
  type!: InAppNotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  href!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  readAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class InAppNotificationsResponseDto {
  @ApiProperty({
    type: [InAppNotificationResponseDto],
  })
  items!: InAppNotificationResponseDto[];

  @ApiProperty({
    minimum: 0,
  })
  unreadCount!: number;
}

export class AutomationEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AutomationType })
  type!: AutomationType;

  @ApiProperty({ enum: AutomationEntityType })
  entityType!: AutomationEntityType;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  href!: string;

  @ApiProperty({ enum: NotificationStatus })
  status!: NotificationStatus;

  @ApiProperty({ type: Date })
  availableAt!: Date;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  finishedAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  lastErrorCode!: string | null;
}

export class AutomationEventsResponseDto {
  @ApiProperty({
    type: [AutomationEventResponseDto],
  })
  items!: AutomationEventResponseDto[];
}
