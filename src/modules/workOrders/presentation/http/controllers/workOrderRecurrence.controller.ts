import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageWorkOrderRecurrenceUseCase } from '../../../application/useCases/manageWorkOrderRecurrence.useCase.js';
import { SaveWorkOrderRecurrenceDto } from '../dtos/requests/workOrderRecurrence.dto.js';
import { WorkOrderRecurrenceResponseDto } from '../dtos/responses/workOrderRecurrenceResponse.dto.js';
import { workOrderOperation } from '../workOrderHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work order recurrence')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/recurrence')
export class WorkOrderRecurrenceController {
  constructor(private readonly recurrence: ManageWorkOrderRecurrenceUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the recurrence configuration of a work order' })
  @ApiDataResponse(WorkOrderRecurrenceResponseDto)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderRecurrenceResponseDto> {
    return workOrderOperation(() => this.recurrence.read({ organizationId, workOrderId, userId: auth.user.id }));
  }

  @Put()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Configure the frequency and next visit of a completed service' })
  @ApiDataResponse(WorkOrderRecurrenceResponseDto)
  save(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: SaveWorkOrderRecurrenceDto,
  ): Promise<WorkOrderRecurrenceResponseDto> {
    return workOrderOperation(() => this.recurrence.save({ organizationId, workOrderId, userId: auth.user.id }, dto));
  }
}
