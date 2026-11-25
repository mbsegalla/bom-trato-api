import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { GetWorkOrderAcceptanceUseCase } from '../../../application/useCases/getWorkOrderAcceptance.useCase.js';
import { WorkOrderAcceptanceResponseDto } from '../dtos/responses/workOrderAcceptanceResponse.dto.js';
import { workOrderAcceptanceOperation } from '../workOrderAcceptanceHttpError.js';

@ApiTags('Work order acceptance')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/acceptance')
export class WorkOrderAcceptanceController {
  constructor(private readonly getWorkOrderAcceptanceUseCase: GetWorkOrderAcceptanceUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the recorded customer acceptance of the current work order completion' })
  @ApiDataResponse(WorkOrderAcceptanceResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('workOrderId', new ParseUUIDPipe({ version: '4' })) workOrderId: string,
  ): Promise<WorkOrderAcceptanceResponseDto> {
    return workOrderAcceptanceOperation(() =>
      this.getWorkOrderAcceptanceUseCase.execute({ organizationId, workOrderId, userId: auth.user.id }),
    );
  }
}
