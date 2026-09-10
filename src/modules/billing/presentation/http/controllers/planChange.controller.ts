import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ChangePlanUseCase } from '../../../application/useCases/changePlan.useCase.js';
import { billingOperation } from '../billingHttpError.js';
import { PreviewPlanChangeDto } from '../dtos/requests/planChangeRequest.dto.js';
import { PlanChangeResponseDto } from '../dtos/responses/planChangeResponse.dto.js';

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/billing/plan-changes')
export class PlanChangeController {
  constructor(private readonly changePlanUseCase: ChangePlanUseCase) {}

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
      this.changePlanUseCase.preview({
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
      this.changePlanUseCase.confirm({
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
      this.changePlanUseCase.read({
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
      this.changePlanUseCase.sync({
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
      this.changePlanUseCase.cancel({
        organizationId,
        userId: auth.user.id,
        changeId,
      }),
    );
  }
}
