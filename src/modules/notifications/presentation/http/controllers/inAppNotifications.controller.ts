import { Controller, Get, HttpCode, MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { SkipResponseEnvelope } from '../../../../../infrastructure/http/decorators/responseEnvelope.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { AuthEndpoint } from '../../../../auth/presentation/http/decorators/authEndpoint.decorator.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { ListInAppNotificationsUseCase } from '../../../application/useCases/listInAppNotifications.useCase.js';
import { MarkAllInAppNotificationsReadUseCase } from '../../../application/useCases/markAllInAppNotificationsRead.useCase.js';
import { MarkInAppNotificationReadUseCase } from '../../../application/useCases/markInAppNotificationRead.useCase.js';
import { NotificationRealtimeService } from '../../../infrastructure/realtime/notificationRealtime.service.js';
import { NotificationStreamTicketService } from '../../../infrastructure/realtime/notificationStreamTicket.service.js';
import { InAppNotificationQueryDto, NotificationStreamQueryDto } from '../dtos/requests/inAppNotification.dto.js';
import {
  InAppNotificationsResponseDto,
  NotificationStreamTicketResponseDto,
} from '../dtos/responses/inAppNotificationResponse.dto.js';
import { inAppNotificationOperation } from '../inAppNotificationHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/notifications')
export class InAppNotificationsController {
  constructor(
    private readonly listUseCase: ListInAppNotificationsUseCase,
    private readonly markReadUseCase: MarkInAppNotificationReadUseCase,
    private readonly markAllReadUseCase: MarkAllInAppNotificationsReadUseCase,
    private readonly streamTickets: NotificationStreamTicketService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List current user notifications for an organization' })
  @ApiDataResponse(InAppNotificationsResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() query: InAppNotificationQueryDto,
  ): Promise<InAppNotificationsResponseDto> {
    return inAppNotificationOperation(() =>
      this.listUseCase.execute({
        userId: auth.user.id,
        organizationId,
        limit: query.limit,
      }),
    );
  }

  @Post('stream-ticket')
  @HttpCode(200)
  @AuthEndpoint('notification-stream-ticket')
  @ApiOperation({ summary: 'Issue a short-lived ticket for the notification SSE stream' })
  @ApiDataResponse(NotificationStreamTicketResponseDto)
  issueStreamTicket(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
  ): Promise<NotificationStreamTicketResponseDto> {
    return inAppNotificationOperation(() =>
      this.streamTickets.issue({
        userId: auth.user.id,
        sessionId: auth.sessionId,
        organizationId,
      }),
    );
  }

  @Sse('stream')
  @PublicRoute()
  @SkipResponseEnvelope()
  @ApiExcludeEndpoint()
  async stream(
    @Param('organizationId', uuid) organizationId: string,
    @Query() query: NotificationStreamQueryDto,
  ): Promise<Observable<MessageEvent>> {
    const identity = await inAppNotificationOperation(() => this.streamTickets.consume(organizationId, query.ticket));

    return this.realtime.stream(identity.userId, identity.organizationId);
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark all organization notifications as read' })
  @ApiNoContentResponse()
  markAll(@CurrentAuth() auth: AuthContext, @Param('organizationId', uuid) organizationId: string): Promise<void> {
    return inAppNotificationOperation(() =>
      this.markAllReadUseCase.execute({
        userId: auth.user.id,
        organizationId,
      }),
    );
  }

  @Post(':notificationId/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiNoContentResponse()
  markRead(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('notificationId', uuid) notificationId: string,
  ): Promise<void> {
    return inAppNotificationOperation(() =>
      this.markReadUseCase.execute({
        id: notificationId,
        userId: auth.user.id,
        organizationId,
      }),
    );
  }
}
