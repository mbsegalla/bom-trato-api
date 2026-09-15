import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { GetDashboardFinancialUseCase } from '../../../application/useCases/getDashboardFinancial.useCase.js';
import { GetDashboardSummaryUseCase } from '../../../application/useCases/getDashboardSummary.useCase.js';
import { ListDashboardUpcomingWorkOrdersUseCase } from '../../../application/useCases/listDashboardUpcomingWorkOrders.useCase.js';
import { dashboardOperation } from '../dashboardHttpError.js';
import { DashboardPeriodDto, DashboardUpcomingDto } from '../dtos/requests/dashboard.dto.js';
import {
  DashboardFinancialResponseDto,
  DashboardSummaryResponseDto,
  DashboardUpcomingResponseDto,
} from '../dtos/responses/dashboardResponse.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/dashboard')
export class DashboardController {
  constructor(
    private readonly getDashboardSummaryUseCase: GetDashboardSummaryUseCase,
    private readonly getDashboardFinancialUseCase: GetDashboardFinancialUseCase,
    private readonly listDashboardUpcomingWorkOrdersUseCase: ListDashboardUpcomingWorkOrdersUseCase,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get current operational counts and period completions' })
  @ApiDataResponse(DashboardSummaryResponseDto)
  summary(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: DashboardPeriodDto,
  ): Promise<DashboardSummaryResponseDto> {
    return dashboardOperation(() =>
      this.getDashboardSummaryUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Get('financial')
  @ApiOperation({ summary: 'Get current receivable balances and period receipts' })
  @ApiDataResponse(DashboardFinancialResponseDto)
  financial(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: DashboardPeriodDto,
  ): Promise<DashboardFinancialResponseDto> {
    return dashboardOperation(() =>
      this.getDashboardFinancialUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Get('upcoming-work-orders')
  @ApiOperation({ summary: 'List the next scheduled work orders' })
  @ApiDataResponse(DashboardUpcomingResponseDto)
  upcoming(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: DashboardUpcomingDto,
  ): Promise<DashboardUpcomingResponseDto> {
    return dashboardOperation(() =>
      this.listDashboardUpcomingWorkOrdersUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto.limit,
      ),
    );
  }
}
