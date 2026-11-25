import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageWorkOrderPortfolioUseCase } from '../../../application/useCases/manageWorkOrderPortfolio.useCase.js';
import { PortfolioPublicationDto } from '../dtos/requests/workOrderPortfolio.dto.js';
import { ManagementPortfolioStatusDto } from '../dtos/responses/workOrderPortfolio.dto.js';
import { workOrderPortfolioOperation } from '../workOrderPortfolioHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work order portfolio')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/portfolio')
export class WorkOrderPortfolioController {
  constructor(private readonly managePortfolio: ManageWorkOrderPortfolioUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List private photo portfolio permissions for a work order' })
  @ApiDataResponse(ManagementPortfolioStatusDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<ManagementPortfolioStatusDto> {
    return workOrderPortfolioOperation(() =>
      this.managePortfolio.list({ organizationId, workOrderId, userId: auth.user.id }),
    );
  }

  @Post(':photoId/revoke-consent')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Withdraw portfolio consent at the request of the customer' })
  @ApiDataResponse(ManagementPortfolioStatusDto)
  revokeConsent(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('photoId', uuid) photoId: string,
  ): Promise<ManagementPortfolioStatusDto> {
    return workOrderPortfolioOperation(() =>
      this.managePortfolio.revoke({ organizationId, workOrderId, photoId, userId: auth.user.id }),
    );
  }

  @Post(':photoId/publish')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Publish or unpublish an explicitly authorized work order photograph' })
  @ApiDataResponse(ManagementPortfolioStatusDto)
  publish(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Param('photoId', uuid) photoId: string,
    @Body() body: PortfolioPublicationDto,
  ): Promise<ManagementPortfolioStatusDto> {
    return workOrderPortfolioOperation(() =>
      this.managePortfolio.publish({ organizationId, workOrderId, photoId, userId: auth.user.id }, body),
    );
  }
}
