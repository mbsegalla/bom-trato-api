import { ApiProperty } from '@nestjs/swagger';

import { InAppNotificationType } from '../../../../../../generated/prisma/enums.js';

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
