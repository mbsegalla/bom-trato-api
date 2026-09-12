import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CancelPlanChangeUseCase } from '../../../application/useCases/cancelPlanChange.useCase.js';
import { ConfirmPlanChangeUseCase } from '../../../application/useCases/confirmPlanChange.useCase.js';
import { GetPlanChangeUseCase } from '../../../application/useCases/getPlanChange.useCase.js';
import { PreviewPlanChangeUseCase } from '../../../application/useCases/previewPlanChange.useCase.js';
import { SyncPlanChangeUseCase } from '../../../application/useCases/syncPlanChange.useCase.js';
import { billingOperation } from '../billingHttpError.js';
import { PreviewPlanChangeDto } from '../dtos/requests/planChangeRequest.dto.js';
import { PlanChangeResponseDto } from '../dtos/responses/planChangeResponse.dto.js';

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/billing/plan-changes')
export class PlanChangeController {
  constructor(
    private readonly previewPlanChangeUseCase: PreviewPlanChangeUseCase,
    private readonly confirmPlanChangeUseCase: ConfirmPlanChangeUseCase,
    private readonly getPlanChangeUseCase: GetPlanChangeUseCase,
    private readonly syncPlanChangeUseCase: SyncPlanChangeUseCase,
    private readonly cancelPlanChangeUseCase: CancelPlanChangeUseCase,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview a subscription plan change' })
  @ApiDataResponse(PlanChangeResponseDto)
  preview(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PreviewPlanChangeDto,
  ): Promise<PlanChangeResponseDto> {
    return billingOperation(() =>
      this.previewPlanChangeUseCase.execute({
        organizationId,
        userId: auth.user.id,
        planPriceId: dto.planPriceId,
      }),
    );
  }

  @Post(':changeId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a plan change' })
  @ApiDataResponse(PlanChangeResponseDto)
  confirm(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('changeId', new ParseUUIDPipe({ version: '4' }))
    changeId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PlanChangeResponseDto> {
    return billingOperation(() =>
      this.confirmPlanChangeUseCase.execute({
        organizationId,
        userId: auth.user.id,
        changeId,
      }),
    );
  }

  @Get(':changeId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Read a plan change' })
  @ApiDataResponse(PlanChangeResponseDto)
  read(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('changeId', new ParseUUIDPipe({ version: '4' }))
    changeId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PlanChangeResponseDto> {
    return billingOperation(() =>
      this.getPlanChangeUseCase.execute({
        organizationId,
        userId: auth.user.id,
        changeId,
      }),
    );
  }

  @Post(':changeId/sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync a plan change' })
  @ApiDataResponse(PlanChangeResponseDto)
  sync(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('changeId', new ParseUUIDPipe({ version: '4' }))
    changeId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PlanChangeResponseDto> {
    return billingOperation(() =>
      this.syncPlanChangeUseCase.execute({
        organizationId,
        userId: auth.user.id,
        changeId,
      }),
    );
  }

  @Delete(':changeId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a plan change' })
  @ApiDataResponse(PlanChangeResponseDto)
  cancel(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('changeId', new ParseUUIDPipe({ version: '4' }))
    changeId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PlanChangeResponseDto> {
    return billingOperation(() =>
      this.cancelPlanChangeUseCase.execute({
        organizationId,
        userId: auth.user.id,
        changeId,
      }),
    );
  }
}
