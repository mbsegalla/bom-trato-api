import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CreateWorkOrderChecklistItemUseCase } from '../../../application/useCases/createWorkOrderChecklistItem.useCase.js';
import { DeleteWorkOrderChecklistItemUseCase } from '../../../application/useCases/deleteWorkOrderChecklistItem.useCase.js';
import { ListWorkOrderChecklistUseCase } from '../../../application/useCases/listWorkOrderChecklist.useCase.js';
import { ReorderWorkOrderChecklistUseCase } from '../../../application/useCases/reorderWorkOrderChecklist.useCase.js';
import { UpdateWorkOrderChecklistItemUseCase } from '../../../application/useCases/updateWorkOrderChecklistItem.useCase.js';
import { WorkOrderVersionDto } from '../dtos/requests/workOrder.dto.js';
import {
  CreateWorkOrderChecklistItemDto,
  ReorderWorkOrderChecklistDto,
  UpdateWorkOrderChecklistItemDto,
} from '../dtos/requests/workOrderChecklist.dto.js';
import {
  WorkOrderChecklistItemResponseDto,
  WorkOrderChecklistResponseDto,
} from '../dtos/responses/workOrderChecklistResponse.dto.js';
import { workOrderChecklistOperation } from '../workOrderChecklistHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work order checklist')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/checklist')
export class WorkOrderChecklistController {
  constructor(
    private readonly listWorkOrderChecklistUseCase: ListWorkOrderChecklistUseCase,
    private readonly createWorkOrderChecklistItemUseCase: CreateWorkOrderChecklistItemUseCase,
    private readonly updateWorkOrderChecklistItemUseCase: UpdateWorkOrderChecklistItemUseCase,
    private readonly deleteWorkOrderChecklistItemUseCase: DeleteWorkOrderChecklistItemUseCase,
    private readonly reorderWorkOrderChecklistUseCase: ReorderWorkOrderChecklistUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List the work order execution checklist and its progress' })
  @ApiDataResponse(WorkOrderChecklistResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderChecklistResponseDto> {
    return workOrderChecklistOperation(() =>
      this.listWorkOrderChecklistUseCase.execute({ organizationId, workOrderId, userId: auth.user.id }),
    );
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a private, incomplete work order checklist item' })
  @ApiDataResponse(WorkOrderChecklistItemResponseDto, { status: 201 })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: CreateWorkOrderChecklistItemDto,
  ): Promise<WorkOrderChecklistItemResponseDto> {
    return workOrderChecklistOperation(() =>
      this.createWorkOrderChecklistItemUseCase.execute({ organizationId, workOrderId, userId: auth.user.id }, dto),
    );
  }

  @Patch('reorder')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reorder every checklist item using their current versions' })
  @ApiDataResponse(WorkOrderChecklistResponseDto)
  reorder(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: ReorderWorkOrderChecklistDto,
  ): Promise<WorkOrderChecklistResponseDto> {
    return workOrderChecklistOperation(() =>
      this.reorderWorkOrderChecklistUseCase.execute({ organizationId, workOrderId, userId: auth.user.id }, dto),
    );
  }

  @Patch(':itemId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Edit, complete, reopen or change the portal visibility of a checklist item' })
  @ApiDataResponse(WorkOrderChecklistItemResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('itemId', uuid) itemId: string,
    @Body() dto: UpdateWorkOrderChecklistItemDto,
  ): Promise<WorkOrderChecklistItemResponseDto> {
    return workOrderChecklistOperation(() =>
      this.updateWorkOrderChecklistItemUseCase.execute(
        { organizationId, workOrderId, itemId, userId: auth.user.id, version: dto.version },
        dto,
      ),
    );
  }

  @Delete(':itemId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a work order checklist item' })
  @ApiNoContentResponse()
  delete(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('itemId', uuid) itemId: string,
    @Body() dto: WorkOrderVersionDto,
  ): Promise<void> {
    return workOrderChecklistOperation(() =>
      this.deleteWorkOrderChecklistItemUseCase.execute({
        organizationId,
        workOrderId,
        itemId,
        userId: auth.user.id,
        version: dto.version,
      }),
    );
  }
}
