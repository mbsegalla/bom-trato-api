import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageWorkOrderRecurrenceUseCase } from '../../../application/useCases/manageWorkOrderRecurrence.useCase.js';
import { WorkOrderRecurrencePageDto } from '../dtos/requests/workOrderRecurrence.dto.js';
import { WorkOrderRecurrencesResponseDto } from '../dtos/responses/workOrderRecurrenceResponse.dto.js';
import { workOrderOperation } from '../workOrderHttpError.js';

@ApiTags('Work order recurrence')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-order-recurrences')
export class WorkOrderRecurrencesController {
  constructor(private readonly recurrence: ManageWorkOrderRecurrenceUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List recurring services for an organization' })
  @ApiDataResponse(WorkOrderRecurrencesResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query() dto: WorkOrderRecurrencePageDto,
  ): Promise<WorkOrderRecurrencesResponseDto> {
    return workOrderOperation(() => this.recurrence.list({ organizationId, userId: auth.user.id }, dto));
  }
}
