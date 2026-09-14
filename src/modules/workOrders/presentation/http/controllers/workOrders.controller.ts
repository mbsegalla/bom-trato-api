import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { AssignWorkOrderUseCase } from '../../../application/useCases/assignWorkOrder.useCase.js';
import { CancelWorkOrderUseCase } from '../../../application/useCases/cancelWorkOrder.useCase.js';
import { CompleteWorkOrderUseCase } from '../../../application/useCases/completeWorkOrder.useCase.js';
import { CreateWorkOrderUseCase } from '../../../application/useCases/createWorkOrder.useCase.js';
import { GetWorkOrderUseCase } from '../../../application/useCases/getWorkOrder.useCase.js';
import { ListWorkOrdersUseCase } from '../../../application/useCases/listWorkOrders.useCase.js';
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
import {
  WorkOrderResponseDto,
  WorkOrdersResponseDto,
  WorkOrderStatusHistoryResponseDto,
} from '../dtos/responses/workOrderResponse.dto.js';
import { workOrderOperation } from '../workOrderHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work orders')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders')
export class WorkOrdersController {
  constructor(
    private readonly createUseCase: CreateWorkOrderUseCase,
    private readonly listUseCase: ListWorkOrdersUseCase,
    private readonly getUseCase: GetWorkOrderUseCase,
    private readonly updateUseCase: UpdateWorkOrderUseCase,
    private readonly assignUseCase: AssignWorkOrderUseCase,
    private readonly scheduleUseCase: ScheduleWorkOrderUseCase,
    private readonly startUseCase: StartWorkOrderUseCase,
    private readonly notesUseCase: UpdateWorkOrderExecutionNotesUseCase,
    private readonly completeUseCase: CompleteWorkOrderUseCase,
    private readonly cancelUseCase: CancelWorkOrderUseCase,
    private readonly historyUseCase: ListWorkOrderStatusHistoryUseCase,
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
    return workOrderOperation(() => this.createUseCase.execute({ organizationId, userId: auth.user.id }, dto.quoteId));
  }

  @Get()
  @ApiOperation({ summary: 'List work orders' })
  @ApiDataResponse(WorkOrdersResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: WorkOrderPageDto,
  ): Promise<WorkOrdersResponseDto> {
    return workOrderOperation(() => this.listUseCase.execute({ organizationId, userId: auth.user.id }, dto));
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
      this.getUseCase.execute({
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
      this.updateUseCase.execute({ organizationId, userId: auth.user.id, workOrderId, version: dto.version }, dto),
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
      this.assignUseCase.execute(
        { organizationId, userId: auth.user.id, workOrderId, version: dto.version },
        dto.assignedToId,
      ),
    );
  }

  @Post(':workOrderId/schedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Schedule or reschedule a work order' })
  @ApiDataResponse(WorkOrderResponseDto)
  schedule(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: ScheduleWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return workOrderOperation(() =>
      this.scheduleUseCase.execute({ organizationId, userId: auth.user.id, workOrderId, version: dto.version }, dto),
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
      this.startUseCase.execute({
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
      this.notesUseCase.execute(
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
      this.completeUseCase.execute({
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
      this.cancelUseCase.execute(
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
      this.historyUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
      }),
    );
  }
}
