import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PageDto } from '../../../../../infrastructure/http/dtos/page.dto.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { AssignWorkOrderUseCase } from '../../../application/useCases/assignWorkOrder.useCase.js';
import { CancelWorkOrderUseCase } from '../../../application/useCases/cancelWorkOrder.useCase.js';
import { CompleteWorkOrderUseCase } from '../../../application/useCases/completeWorkOrder.useCase.js';
import { CreateWorkOrderUseCase } from '../../../application/useCases/createWorkOrder.useCase.js';
import { GetWorkOrderUseCase } from '../../../application/useCases/getWorkOrder.useCase.js';
import { ListWorkOrdersUseCase } from '../../../application/useCases/listWorkOrders.useCase.js';
import { ListWorkOrderScheduleUseCase } from '../../../application/useCases/listWorkOrderSchedule.useCase.js';
import { ListWorkOrderScheduleHistoryUseCase } from '../../../application/useCases/listWorkOrderScheduleHistory.useCase.js';
import { ListWorkOrderStatusHistoryUseCase } from '../../../application/useCases/listWorkOrderStatusHistory.useCase.js';
import { ScheduleWorkOrderUseCase } from '../../../application/useCases/scheduleWorkOrder.useCase.js';
import { StartWorkOrderUseCase } from '../../../application/useCases/startWorkOrder.useCase.js';
import { UpdateWorkOrderUseCase } from '../../../application/useCases/updateWorkOrder.useCase.js';
import { UpdateWorkOrderExecutionNotesUseCase } from '../../../application/useCases/updateWorkOrderExecutionNotes.useCase.js';
import {
  AssignWorkOrderDto,
  CancelWorkOrderDto,
  CreateWorkOrderDto,
  ScheduleWorkOrderDto,
  UpdateWorkOrderDto,
  WorkOrderExecutionNotesDto,
  WorkOrderPageDto,
  WorkOrderVersionDto,
} from '../dtos/requests/workOrder.dto.js';
import { WorkOrderScheduleDto } from '../dtos/requests/workOrderSchedule.dto.js';
import {
  WorkOrderResponseDto,
  WorkOrdersResponseDto,
  WorkOrderStatusHistoryResponseDto,
} from '../dtos/responses/workOrderResponse.dto.js';
import {
  WorkOrderScheduleHistoryResponseDto,
  WorkOrderScheduleResponseDto,
} from '../dtos/responses/workOrderScheduleResponse.dto.js';
import { workOrderOperation } from '../workOrderHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work orders')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders')
export class WorkOrdersController {
  constructor(
    private readonly createWorkOrderUseCase: CreateWorkOrderUseCase,
    private readonly listWorkOrdersUseCase: ListWorkOrdersUseCase,
    private readonly getWorkOrderUseCase: GetWorkOrderUseCase,
    private readonly updateWorkOrderUseCase: UpdateWorkOrderUseCase,
    private readonly assignWorkOrderUseCase: AssignWorkOrderUseCase,
    private readonly scheduleWorkOrderUseCase: ScheduleWorkOrderUseCase,
    private readonly startWorkOrderUseCase: StartWorkOrderUseCase,
    private readonly updateWorkOrderExecutionNotesUseCase: UpdateWorkOrderExecutionNotesUseCase,
    private readonly completeWorkOrderUseCase: CompleteWorkOrderUseCase,
    private readonly cancelWorkOrderUseCase: CancelWorkOrderUseCase,
    private readonly listWorkOrderStatusHistoryUseCase: ListWorkOrderStatusHistoryUseCase,
    private readonly listWorkOrderScheduleUseCase: ListWorkOrderScheduleUseCase,
    private readonly listWorkOrderScheduleHistoryUseCase: ListWorkOrderScheduleHistoryUseCase,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or get a work order from an approved quote' })
  @ApiDataResponse(WorkOrderResponseDto)
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: CreateWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.createWorkOrderUseCase.execute({ organizationId, userId: auth.user.id }, dto.quoteId),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List work orders' })
  @ApiDataResponse(WorkOrdersResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: WorkOrderPageDto,
  ): Promise<WorkOrdersResponseDto> {
    return workOrderOperation(() => this.listWorkOrdersUseCase.execute({ organizationId, userId: auth.user.id }, dto));
  }

  @Get(':workOrderId')
  @ApiOperation({ summary: 'Get a work order' })
  @ApiDataResponse(WorkOrderResponseDto)
  find(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.getWorkOrderUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
      }),
    );
  }

  @Patch(':workOrderId')
  @ApiOperation({ summary: 'Update work order planning details' })
  @ApiDataResponse(WorkOrderResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: UpdateWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.updateWorkOrderUseCase.execute(
        { organizationId, userId: auth.user.id, workOrderId, version: dto.version },
        dto,
      ),
    );
  }

  @Post(':workOrderId/assign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Assign a work order to an organization member' })
  @ApiDataResponse(WorkOrderResponseDto)
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: AssignWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.assignWorkOrderUseCase.execute(
        { organizationId, userId: auth.user.id, workOrderId, version: dto.version },
        dto.assignedToId,
      ),
    );
  }

  @Post(':workOrderId/schedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Schedule or reschedule a work order' })
  @ApiDataResponse(WorkOrderResponseDto)
  workSchedule(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: ScheduleWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.scheduleWorkOrderUseCase.execute(
        { organizationId, userId: auth.user.id, workOrderId, version: dto.version },
        dto,
      ),
    );
  }

  @Post(':workOrderId/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start work order execution' })
  @ApiDataResponse(WorkOrderResponseDto)
  start(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: WorkOrderVersionDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.startWorkOrderUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
        version: dto.version,
      }),
    );
  }

  @Patch(':workOrderId/execution-notes')
  @ApiOperation({ summary: 'Update execution notes' })
  @ApiDataResponse(WorkOrderResponseDto)
  notes(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: WorkOrderExecutionNotesDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.updateWorkOrderExecutionNotesUseCase.execute(
        { organizationId, userId: auth.user.id, workOrderId, version: dto.version },
        dto.executionNotes,
      ),
    );
  }

  @Post(':workOrderId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a work order' })
  @ApiDataResponse(WorkOrderResponseDto)
  complete(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: WorkOrderVersionDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.completeWorkOrderUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
        version: dto.version,
      }),
    );
  }

  @Post(':workOrderId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a work order with a reason' })
  @ApiDataResponse(WorkOrderResponseDto)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: CancelWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.cancelWorkOrderUseCase.execute(
        { organizationId, userId: auth.user.id, workOrderId, version: dto.version },
        dto.reason,
      ),
    );
  }

  @Get(':workOrderId/status-history')
  @ApiOperation({ summary: 'List work order status history' })
  @ApiDataResponse(WorkOrderStatusHistoryResponseDto, { array: true })
  history(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderStatusHistoryResponseDto[]> {
    return workOrderOperation(() =>
      this.listWorkOrderStatusHistoryUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
      }),
    );
  }

  @Get('schedule')
  @ApiOperation({ summary: 'List scheduled work orders within a period of up to 31 days' })
  @ApiDataResponse(WorkOrderScheduleResponseDto)
  schedule(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: WorkOrderScheduleDto,
  ): Promise<WorkOrderScheduleResponseDto> {
    return workOrderOperation(() =>
      this.listWorkOrderScheduleUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Get(':workOrderId/schedule-history')
  @ApiOperation({ summary: 'List work order scheduling history' })
  @ApiDataResponse(WorkOrderScheduleHistoryResponseDto)
  scheduleHistory(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Query() dto: PageDto,
  ): Promise<WorkOrderScheduleHistoryResponseDto> {
    return workOrderOperation(() =>
      this.listWorkOrderScheduleHistoryUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          workOrderId,
        },
        dto,
      ),
    );
  }
}
