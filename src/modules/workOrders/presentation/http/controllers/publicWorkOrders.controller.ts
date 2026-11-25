import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { GetPublicWorkOrderUseCase } from '../../../application/useCases/getPublicWorkOrder.useCase.js';
import { PublicWorkOrderTokenDto } from '../dtos/requests/publicWorkOrder.dto.js';
import { PublicWorkOrderResponseDto } from '../dtos/responses/publicWorkOrderResponse.dto.js';
import { WorkOrderShareRateLimitGuard } from '../guards/workOrderShareRateLimit.guard.js';
import { workOrderShareOperation } from '../workOrderShareHttpError.js';

@ApiTags('Public work orders')
@PublicRoute()
@UseGuards(WorkOrderShareRateLimitGuard)
@Controller('public/work-orders')
export class PublicWorkOrdersController {
  constructor(private readonly getPublicWorkOrderUseCase: GetPublicWorkOrderUseCase) {}

  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read a work order using a private share token',
  })
  @ApiDataResponse(PublicWorkOrderResponseDto)
  resolve(@Body() dto: PublicWorkOrderTokenDto): Promise<PublicWorkOrderResponseDto> {
    return workOrderShareOperation(() => this.getPublicWorkOrderUseCase.execute(dto.token));
  }
}
